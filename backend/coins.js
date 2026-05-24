import { get, run, withTransaction, all } from './db.js';

/** Монет за один выданный заказ. */
export const COINS_PER_ORDER = Number(process.env.COINS_PER_ORDER || 10);

/** Стоимость постановки трека в jukebox. */
export const JUKEBOX_SONG_COST = Number(process.env.JUKEBOX_SONG_COST || 15);

/**
 * @typedef {Object} WalletRow
 * @property {string} telegram_user_id
 * @property {number} balance
 * @property {string} updated_at
 */

/**
 * Гарантирует кошелёк пользователя.
 * @param {string} telegramUserId
 * @param {{ get: typeof get, run: typeof run }} db
 */
async function ensureWalletInDb(telegramUserId, db) {
  const uid = String(telegramUserId ?? '').trim();
  if (!uid) throw new Error('Некорректный telegram_user_id');

  await db.run(
    `INSERT INTO user_wallets (telegram_user_id, balance)
     VALUES (?, 0)
     ON CONFLICT(telegram_user_id) DO NOTHING
     RETURNING telegram_user_id`,
    [uid],
  );
}

/**
 * Возвращает баланс пользователя.
 * @param {string} telegramUserId
 * @returns {Promise<{ telegram_user_id: string, balance: number }>}
 */
export async function getWallet(telegramUserId) {
  const uid = String(telegramUserId ?? '').trim();
  if (!uid) return { telegram_user_id: '', balance: 0 };

  await ensureWalletInDb(uid, { get, run });
  const row = await get('SELECT telegram_user_id, balance FROM user_wallets WHERE telegram_user_id=?', [uid]);
  return {
    telegram_user_id: uid,
    balance: Number(row?.balance || 0),
  };
}

/**
 * Записывает транзакцию и обновляет баланс.
 * @param {string} telegramUserId
 * @param {number} delta
 * @param {string} reason
 * @param {{ orderId?: number, meta?: Record<string, unknown> }} [options]
 * @param {{ get: typeof get, run: typeof run }} db
 * @returns {Promise<number>}
 */
async function applyDeltaInDb(telegramUserId, delta, reason, options, db) {
  await ensureWalletInDb(telegramUserId, db);
  const current = await db.get('SELECT balance FROM user_wallets WHERE telegram_user_id=?', [telegramUserId]);
  const nextBalance = Number(current?.balance || 0) + delta;
  if (nextBalance < 0) {
    const err = new Error('Недостаточно монет');
    err.code = 'INSUFFICIENT_COINS';
    throw err;
  }

  await db.run(
    'UPDATE user_wallets SET balance=?, updated_at=CURRENT_TIMESTAMP WHERE telegram_user_id=?',
    [nextBalance, telegramUserId],
  );
  await db.run(
    `INSERT INTO coin_transactions (telegram_user_id, delta, balance_after, reason, order_id, meta)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      telegramUserId,
      delta,
      nextBalance,
      reason,
      options?.orderId ?? null,
      options?.meta ? JSON.stringify(options.meta) : null,
    ],
  );
  return nextBalance;
}

/**
 * Начисляет монеты пользователю.
 * @param {string} telegramUserId
 * @param {number} amount
 * @param {string} reason
 * @param {{ orderId?: number, meta?: Record<string, unknown> }} [options]
 * @returns {Promise<number>}
 */
export async function addCoins(telegramUserId, amount, reason, options = {}) {
  const delta = Math.max(0, Math.round(Number(amount)));
  if (!delta) return (await getWallet(telegramUserId)).balance;
  return withTransaction((db) => applyDeltaInDb(telegramUserId, delta, reason, options, db));
}

/**
 * Списывает монеты с кошелька.
 * @param {string} telegramUserId
 * @param {number} amount
 * @param {string} reason
 * @param {{ meta?: Record<string, unknown> }} [options]
 * @returns {Promise<number>}
 */
export async function spendCoins(telegramUserId, amount, reason, options = {}) {
  const delta = -Math.max(0, Math.round(Number(amount)));
  if (!delta) return (await getWallet(telegramUserId)).balance;
  return withTransaction((db) => applyDeltaInDb(telegramUserId, delta, reason, options, db));
}

/**
 * Админская установка абсолютного баланса.
 * @param {string} telegramUserId
 * @param {number} balance
 * @param {string} adminLabel
 * @returns {Promise<number>}
 */
export async function setWalletBalance(telegramUserId, balance, adminLabel = 'admin') {
  const uid = String(telegramUserId ?? '').trim();
  const target = Math.max(0, Math.round(Number(balance)));
  return withTransaction(async (db) => {
    await ensureWalletInDb(uid, db);
    const current = await db.get('SELECT balance FROM user_wallets WHERE telegram_user_id=?', [uid]);
    const currentBalance = Number(current?.balance || 0);
    const delta = target - currentBalance;
    if (!delta) return target;
    return applyDeltaInDb(uid, delta, `admin_set:${adminLabel}`, { meta: { target } }, db);
  });
}

/**
 * Админское изменение баланса на delta.
 * @param {string} telegramUserId
 * @param {number} delta
 * @param {string} adminLabel
 * @returns {Promise<number>}
 */
export async function adjustWalletBalance(telegramUserId, delta, adminLabel = 'admin') {
  const uid = String(telegramUserId ?? '').trim();
  const change = Math.round(Number(delta));
  if (!change) return (await getWallet(uid)).balance;
  return withTransaction((db) => applyDeltaInDb(uid, change, `admin_adjust:${adminLabel}`, {}, db));
}

/**
 * Начисляет монеты за выданный заказ один раз.
 * @param {Record<string, unknown>} order
 * @returns {Promise<{ awarded: boolean, balance?: number }>}
 */
export async function awardOrderCoins(order) {
  const orderId = Number(order.id);
  const uid = String(order.telegram_user_id ?? '').trim();
  if (!uid || !Number.isFinite(orderId)) return { awarded: false };

  const fresh = await get('SELECT coins_awarded FROM orders WHERE id=?', [orderId]);
  if (Number(fresh?.coins_awarded) === 1) return { awarded: false };

  const balance = await addCoins(uid, COINS_PER_ORDER, 'order_done', { orderId });
  await run('UPDATE orders SET coins_awarded=1 WHERE id=?', [orderId]);
  return { awarded: true, balance };
}

/**
 * Список кошельков для админки.
 * @param {string} [search]
 * @returns {Promise<Array<{ telegram_user_id: string, balance: number, updated_at: string }>>}
 */
export async function listWallets(search = '') {
  const q = String(search || '').trim();
  if (q) {
    return allWallets(
      `SELECT telegram_user_id, balance, updated_at
       FROM user_wallets
       WHERE telegram_user_id LIKE ?
       ORDER BY updated_at DESC
       LIMIT 100`,
      [`%${q}%`],
    );
  }
  return allWallets(
    `SELECT telegram_user_id, balance, updated_at
     FROM user_wallets
     ORDER BY updated_at DESC
     LIMIT 100`,
    [],
  );
}

/**
 * @param {string} sql
 * @param {unknown[]} params
 */
async function allWallets(sql, params) {
  const rows = await all(sql, params);
  return rows.map((row) => ({
    telegram_user_id: String(row.telegram_user_id),
    balance: Number(row.balance || 0),
    updated_at: row.updated_at,
  }));
}
