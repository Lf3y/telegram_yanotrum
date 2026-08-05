/**
 * Купоны:
 * — персональные (user_id задан) и глобальные «ивент»-купоны (user_id NULL — для всех);
 * — типы: percent (скидка %), fixed (скидка BYN), free_item (подарок к заказу);
 * — uses_total: для персональных — всего использований, для глобальных — на пользователя;
 * — применение фиксируется в coupon_uses; при отмене заказа использование возвращается.
 */
import { all, get, run } from './db.js';

export const COUPON_TYPES = ['percent', 'fixed', 'free_item'];

/** @param {unknown} raw ISO-строка или null */
function toExpiresAt(raw) {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** @param {Record<string, unknown>} c строка из таблицы coupons */
function isExpired(c) {
  if (!c.expires_at) return false;
  const t = new Date(String(c.expires_at)).getTime();
  return Number.isFinite(t) && t < Date.now();
}

/**
 * Выдать купон (из кода: рефералка / админка).
 * @param {{
 *   user_id?: string|null,
 *   type: string,
 *   value?: number,
 *   title: string,
 *   description?: string|null,
 *   uses_total?: number,
 *   expiresInDays?: number|null,
 *   expires_at?: string|null,
 *   source?: string,
 * }} cfg
 */
export async function grantCoupon(cfg) {
  const type = String(cfg.type);
  if (!COUPON_TYPES.includes(type)) throw new Error(`Unknown coupon type: ${type}`);

  let expiresAt = toExpiresAt(cfg.expires_at);
  if (!expiresAt && cfg.expiresInDays != null && Number.isFinite(Number(cfg.expiresInDays))) {
    expiresAt = new Date(Date.now() + Number(cfg.expiresInDays) * 86400000).toISOString();
  }

  const r = await run(
    `INSERT INTO coupons (user_id, type, value, title, description, uses_total, expires_at, active, source)
     VALUES (?,?,?,?,?,?,?,1,?)`,
    [
      cfg.user_id != null ? String(cfg.user_id) : null,
      type,
      Number(cfg.value) || 0,
      String(cfg.title),
      cfg.description != null ? String(cfg.description) : null,
      Math.max(1, Number(cfg.uses_total) || 1),
      expiresAt,
      String(cfg.source || 'admin'),
    ],
  );
  return get('SELECT * FROM coupons WHERE id=?', [r.lastInsertRowid]);
}

/** Сколько раз купон использован данным пользователем / всего. */
async function usesFor(couponId, userId) {
  const totalRow = await get('SELECT COUNT(*) AS cnt FROM coupon_uses WHERE coupon_id=?', [couponId]);
  const userRow = await get(
    'SELECT COUNT(*) AS cnt FROM coupon_uses WHERE coupon_id=? AND user_id=?',
    [couponId, String(userId)],
  );
  return { total: Number(totalRow?.cnt) || 0, byUser: Number(userRow?.cnt) || 0 };
}

/**
 * Оставшиеся использования купона для пользователя (личного или глобального).
 * @returns {Promise<number>}
 */
async function usesLeftFor(coupon, userId) {
  const usesTotal = Math.max(1, Number(coupon.uses_total) || 1);
  const { total, byUser } = await usesFor(coupon.id, userId);
  return coupon.user_id != null
    ? Math.max(0, usesTotal - total) // персональный: общий лимит
    : Math.max(0, usesTotal - byUser); // глобальный: лимит на пользователя
}

/**
 * Доступные пользователю купоны (личные + активные глобальные) с остатком использований.
 * @param {string} userId
 */
export async function listUserCoupons(userId) {
  const uid = String(userId);
  const rows = await all(
    `SELECT * FROM coupons
     WHERE (user_id = ? OR user_id IS NULL)
     ORDER BY created_at DESC`,
    [uid],
  );

  const result = [];
  for (const c of rows) {
    const usesLeft = await usesLeftFor(c, uid);
    const expired = isExpired(c);
    const usable = Number(c.active) === 1 && !expired && usesLeft > 0;
    // Глобальные купоны, которые пользователь ни разу не трогал и которые уже
    // неактивны/просрочены — не показываем (не захламляем инвентарь чужими ивентами).
    if (c.user_id == null && !usable) {
      const { byUser } = await usesFor(c.id, uid);
      if (byUser === 0) continue;
    }
    result.push({
      ...c,
      uses_left: usesLeft,
      expired,
      usable,
      is_event: c.user_id == null,
    });
  }
  return result;
}

/**
 * Проверка купона перед применением к заказу.
 * @returns {Promise<{ ok: true, coupon: Record<string, unknown> } | { ok: false, message: string }>}
 */
export async function validateCouponForUser(couponId, userId) {
  const id = Number(couponId);
  if (!Number.isFinite(id)) return { ok: false, message: 'Некорректный купон' };
  const coupon = await get('SELECT * FROM coupons WHERE id=?', [id]);
  if (!coupon) return { ok: false, message: 'Купон не найден' };
  if (Number(coupon.active) !== 1) return { ok: false, message: 'Купон деактивирован' };
  if (coupon.user_id != null && String(coupon.user_id) !== String(userId)) {
    return { ok: false, message: 'Это чужой купон' };
  }
  if (isExpired(coupon)) return { ok: false, message: 'Срок действия купона истёк' };
  const left = await usesLeftFor(coupon, userId);
  if (left <= 0) return { ok: false, message: 'Купон уже использован' };
  return { ok: true, coupon };
}

/**
 * Скидка купона от подытога (free_item не меняет сумму — это подарок).
 * @param {Record<string, unknown>} coupon
 * @param {number} subtotal
 */
export function couponDiscountAmount(coupon, subtotal) {
  const type = String(coupon.type);
  const value = Number(coupon.value) || 0;
  if (type === 'percent') return Math.max(0, subtotal * value / 100);
  if (type === 'fixed') return Math.max(0, Math.min(value, subtotal));
  return 0;
}

/** Зафиксировать использование купона (в транзакции заказа). */
export async function markCouponUsed(db, couponId, userId, orderId) {
  await db.run(
    'INSERT INTO coupon_uses (coupon_id, user_id, order_id) VALUES (?,?,?)',
    [Number(couponId), String(userId), Number(orderId)],
  );
}

/** Вернуть купон при отмене заказа. */
export async function restoreCouponUsesForOrder(orderId) {
  await run('DELETE FROM coupon_uses WHERE order_id=?', [Number(orderId)]);
}

// ——— Админка ———

/** Все купоны со статистикой использований. */
export async function adminListCoupons() {
  const rows = await all(`
    SELECT c.*,
           (SELECT COUNT(*) FROM coupon_uses u WHERE u.coupon_id = c.id) AS uses_count
    FROM coupons c
    ORDER BY c.created_at DESC
    LIMIT 500
  `);
  return rows.map((r) => ({ ...r, is_event: r.user_id == null }));
}

export async function adminSetCouponActive(id, active) {
  await run('UPDATE coupons SET active=? WHERE id=?', [active ? 1 : 0, Number(id)]);
  return get('SELECT * FROM coupons WHERE id=?', [Number(id)]);
}

export async function adminDeleteCoupon(id) {
  await run('DELETE FROM coupon_uses WHERE coupon_id=?', [Number(id)]);
  await run('DELETE FROM coupons WHERE id=?', [Number(id)]);
}
