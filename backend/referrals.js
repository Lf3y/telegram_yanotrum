/**
 * Реферальная система:
 * — привязка «кто кого пригласил» (одна и навсегда, первый пригласивший);
 * — реферал «засчитывается» после первого ВЫДАННОГО заказа;
 * — уровни за засчитанных рефералов дают постоянную скидку;
 * — награды: купон за каждого засчитанного друга + разовый подарок за 10.
 */
import { all, get, run } from './db.js';
import { grantCoupon } from './coupons.js';

/** Уровни: need — засчитанных рефералов, discount — постоянная скидка в %. */
export const REFERRAL_LEVELS = [
  { level: 0, need: 0, discount: 0, name: 'Новичок' },
  { level: 1, need: 1, discount: 1, name: 'Искра' },
  { level: 2, need: 3, discount: 2, name: 'Дым' },
  { level: 3, need: 5, discount: 3, name: 'Туман' },
  { level: 4, need: 10, discount: 5, name: 'Легенда' },
];

/** Купон-награда за каждого засчитанного реферала. */
const PER_REFERRAL_COUPON = {
  type: 'percent',
  value: 5,
  title: 'Купон за друга: −5%',
  description: 'Спасибо, что позвали друга! Разовая скидка 5% на любой заказ.',
  uses_total: 1,
  expiresInDays: 30,
  source: 'referral',
};

/** Подарок за каждые 10 засчитанных рефералов (10, 20, 30, …). */
const TEN_REFERRALS_GIFT = {
  type: 'free_item',
  value: 0,
  title: 'Банка жижи в подарок',
  description: 'Награда за каждые 10 друзей с покупками. Применяется к заказу — подарок выдадут вместе с ним.',
  uses_total: 1,
  expiresInDays: null,
  source: 'referral_10',
};

/** @param {number} qualifiedCount */
export function levelForCount(qualifiedCount) {
  let current = REFERRAL_LEVELS[0];
  for (const lvl of REFERRAL_LEVELS) {
    if (qualifiedCount >= lvl.need) current = lvl;
  }
  return current;
}

/** @param {number} qualifiedCount */
export function nextLevelFor(qualifiedCount) {
  return REFERRAL_LEVELS.find((l) => l.need > qualifiedCount) || null;
}

/**
 * Привязка реферала. Не перезаписывает существующую, игнорирует самоприглашение
 * и пользователей, у которых уже были заказы (не «новый» клиент).
 * @param {string|number} referrerUserId
 * @param {string|number} referredUserId
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function claimReferral(referrerUserId, referredUserId) {
  const referrer = String(referrerUserId ?? '').trim();
  const referred = String(referredUserId ?? '').trim();
  if (!referrer || !referred) return { ok: false, reason: 'BAD_IDS' };
  if (referrer === referred) return { ok: false, reason: 'SELF' };
  if (!/^\d+$/.test(referrer)) return { ok: false, reason: 'BAD_REFERRER' };

  const existing = await get('SELECT referred_user_id FROM referrals WHERE referred_user_id=?', [referred]);
  if (existing) return { ok: false, reason: 'ALREADY_BOUND' };

  const prevOrder = await get('SELECT id FROM orders WHERE telegram_user_id=? LIMIT 1', [referred]);
  if (prevOrder) return { ok: false, reason: 'NOT_NEW_USER' };

  await run(
    'INSERT INTO referrals (referred_user_id, referrer_user_id) VALUES (?,?)',
    [referred, referrer],
  );
  return { ok: true };
}

/** Постоянная скидка уровня для пользователя (в процентах). */
export async function getLevelDiscountPercent(userId) {
  const row = await get(
    'SELECT COUNT(*) AS cnt FROM referrals WHERE referrer_user_id=? AND qualified=1',
    [String(userId)],
  );
  return levelForCount(Number(row?.cnt) || 0).discount;
}

/**
 * Сводка для профиля: уровень, скидка, прогресс, список приглашённых.
 * @param {string} userId
 */
export async function getReferralSummary(userId) {
  const uid = String(userId);
  const rows = await all(
    `SELECT r.referred_user_id, r.qualified, r.orders_count, r.created_at,
            (SELECT MAX(o.telegram_first_name) FROM orders o WHERE o.telegram_user_id = r.referred_user_id) AS first_name
     FROM referrals r
     WHERE r.referrer_user_id = ?
     ORDER BY r.qualified DESC, r.orders_count DESC, r.created_at DESC`,
    [uid],
  );

  const invited = rows.length;
  const qualified = rows.filter((r) => Number(r.qualified) === 1).length;
  const level = levelForCount(qualified);
  const nextLevel = nextLevelFor(qualified);
  const boundTo = await get('SELECT referrer_user_id FROM referrals WHERE referred_user_id=?', [uid]);

  return {
    invited,
    qualified,
    level: level.level,
    levelName: level.name,
    discountPercent: level.discount,
    nextLevel: nextLevel
      ? { level: nextLevel.level, name: nextLevel.name, need: nextLevel.need, discount: nextLevel.discount }
      : null,
    referredBy: boundTo?.referrer_user_id || null,
    giftsEarned: Math.floor(qualified / 10),
    nextGiftIn: 10 - (qualified % 10),
    levels: REFERRAL_LEVELS,
    referrals: rows.map((r) => ({
      name: r.first_name ? String(r.first_name) : 'Гость',
      qualified: Number(r.qualified) === 1,
      orders_count: Number(r.orders_count) || 0,
      created_at: r.created_at,
    })),
  };
}

/**
 * Хук «заказ выдан»: обновляет статистику реферала и выдаёт награды пригласившему.
 * @param {{ telegram_user_id: string }} order
 * @param {(userId: string, text: string) => void} [notifyUser] отправка сообщения в Telegram
 */
export async function onOrderDone(order, notifyUser) {
  const referred = String(order?.telegram_user_id ?? '').trim();
  if (!referred) return;

  const ref = await get('SELECT * FROM referrals WHERE referred_user_id=?', [referred]);
  if (!ref) return;

  const wasQualified = Number(ref.qualified) === 1;
  await run(
    `UPDATE referrals
     SET orders_count = COALESCE(orders_count,0) + 1,
         qualified = 1,
         qualified_at = COALESCE(qualified_at, CURRENT_TIMESTAMP)
     WHERE referred_user_id=?`,
    [referred],
  );

  if (wasQualified) return;

  const referrer = String(ref.referrer_user_id);
  const cntRow = await get(
    'SELECT COUNT(*) AS cnt FROM referrals WHERE referrer_user_id=? AND qualified=1',
    [referrer],
  );
  const qualifiedCount = Number(cntRow?.cnt) || 0;

  // Купон за каждого засчитанного друга
  await grantCoupon({ user_id: referrer, ...PER_REFERRAL_COUPON });

  const messages = [
    `🎉 Ваш друг сделал первую покупку! В инвентаре вас ждёт купон «${PER_REFERRAL_COUPON.title}».`,
  ];

  // Уровень мог вырасти
  const before = levelForCount(qualifiedCount - 1);
  const after = levelForCount(qualifiedCount);
  if (after.level > before.level && after.discount > 0) {
    messages.push(`⬆️ Новый уровень «${after.name}»: постоянная скидка ${after.discount}% на все заказы.`);
  }

  // Подарок за каждые полные 10 друзей с покупками (10, 20, 30, …)
  const giftsEntitled = Math.floor(qualifiedCount / 10);
  if (giftsEntitled > 0) {
    const grantedRow = await get(
      "SELECT COUNT(*) AS cnt FROM coupons WHERE user_id=? AND source='referral_10'",
      [referrer],
    );
    const giftsGranted = Number(grantedRow?.cnt) || 0;
    for (let i = giftsGranted; i < giftsEntitled; i++) {
      await grantCoupon({ user_id: referrer, ...TEN_REFERRALS_GIFT });
    }
    if (giftsEntitled > giftsGranted) {
      messages.push(`🎁 ${qualifiedCount} друзей с покупками! В инвентаре — купон «Банка жижи в подарок». Такой подарок ждёт вас за каждые новые 10 друзей.`);
    }
  }

  if (typeof notifyUser === 'function') {
    notifyUser(referrer, messages.join('\n\n'));
  }
}
