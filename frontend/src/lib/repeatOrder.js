import { apiFetch } from './api';

/**
 * Повтор заказа: добавляет доступные позиции в корзину.
 * @param {number} orderId
 * @param {string | number} telegramUserId
 * @param {(action: { type: string, items?: unknown[] }) => void} dispatch
 * @returns {Promise<{ added: number, skipped: number, partial: boolean }>}
 */
export async function repeatOrderToCart(orderId, telegramUserId, dispatch) {
  const res = await apiFetch(`/api/orders/${orderId}/repeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_user_id: String(telegramUserId) }),
  });
  const data = await res.json();
  const available = (data.items || []).filter((i) => i.available);

  if (available.length) {
    dispatch({
      type: 'ADD_MANY',
      items: available.map((i) => ({
        product_id: Number(i.product_id),
        name: String(i.name || ''),
        brand: i.brand != null ? String(i.brand) : '',
        price: Number(i.price),
        stock_qty: i.stock_qty,
        qty: Number(i.qty) || 1,
      })),
    });
  }

  const skipped = Number(data.skipped_count) || 0;
  const partial = available.some((i) => i.reason);
  return { added: available.length, skipped, partial };
}
