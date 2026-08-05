/**
 * Переходы статуса заказа + остатки:
 * — при оформлении заказа остатки резервируются (POST /api/orders, stock_reserved=1);
 * — подтверждение / выдача — остатки уже списаны, ничего не делаем;
 * — при отмене возвращаем остатки один раз (если stock_reserved=1).
 */
import { get, run } from './db.js';
import { restoreStock } from './stock.js';

export async function transitionOrderStatus(orderId, nextStatus) {
  const id = Number(orderId);
  if (!Number.isFinite(id)) return { ok: false, code: 'BAD_ID', message: 'Некорректный id заказа' };

  const cur = await get('SELECT * FROM orders WHERE id=?', [id]);
  if (!cur) return { ok: false, code: 'NOT_FOUND', message: 'Заказ не найден' };

  const prev = String(cur.status || 'new');
  const next = String(nextStatus);

  if (prev === next) {
    return { ok: true, order: cur, prev, next, skipped: true };
  }

  let items;
  try {
    items = JSON.parse(cur.items);
  } catch {
    return { ok: false, code: 'BAD_ITEMS', message: 'Повреждённые позиции заказа' };
  }
  if (!Array.isArray(items)) {
    return { ok: false, code: 'BAD_ITEMS', message: 'Некорректный состав заказа' };
  }

  const stockReserved = Number(cur.stock_reserved) === 1;

  if (next === 'cancelled' && prev !== 'cancelled') {
    if (stockReserved) {
      await restoreStock({ get, run }, items);
      await run('UPDATE orders SET stock_reserved=0 WHERE id=?', [id]);
    }
    // Возвращаем применённый купон клиенту
    const { restoreCouponUsesForOrder } = await import('./coupons.js');
    await restoreCouponUsesForOrder(id);
  }

  await run('UPDATE orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [next, id]);
  const order = await get('SELECT * FROM orders WHERE id=?', [id]);

  if (next === 'done' && prev !== 'done') {
    // Реферальная система: засчитываем покупку и выдаём награды пригласившему
    try {
      const [{ onOrderDone }, { notifyUserText }] = await Promise.all([
        import('./referrals.js'),
        import('./bot.js'),
      ]);
      await onOrderDone(order, notifyUserText);
    } catch (e) {
      console.error('referral onOrderDone:', e?.message || e);
    }
  }

  return { ok: true, order, prev, next, skipped: false };
}
