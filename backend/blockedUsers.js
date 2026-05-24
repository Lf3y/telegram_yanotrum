import { get } from './db.js';

/**
 * Проверяет, заблокирован ли пользователь Telegram.
 * @param {string | number} telegramUserId
 * @returns {Promise<{ blocked: boolean, reason?: string | null }>}
 */
export async function getBlockStatus(telegramUserId) {
  const id = String(telegramUserId ?? '').trim();
  if (!id) return { blocked: false };
  const row = await get(
    'SELECT reason FROM blocked_users WHERE telegram_user_id=?',
    [id],
  );
  if (!row) return { blocked: false };
  return { blocked: true, reason: row.reason || null };
}

/** @param {string | number} telegramUserId */
export async function isUserBlocked(telegramUserId) {
  const st = await getBlockStatus(telegramUserId);
  return st.blocked;
}

/**
 * Сообщение для клиента при блокировке.
 * @param {string | null | undefined} reason
 */
export function blockedUserMessage(reason) {
  const base = 'Доступ к заказам временно ограничен. Если это ошибка — напишите владельцу магазина в Telegram.';
  if (reason && String(reason).trim()) {
    return `${base}\n\nПричина: ${String(reason).trim()}`;
  }
  return base;
}
