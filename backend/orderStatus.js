/**
 * Переходы статуса заказа + остатки:
 * — при оформлении заказ остатки НЕ списываются;
 * — при переходе в done списываем stock_qty (если не безлимит −1);
 * — при переходе из done в cancelled возвращаем остатки;
 * — отмена из new/processing/replied не трогает склад (ничего не списали).
 */
import { get, run } from './db.js';

async function deductStock(items) {
  /** Сначала проверяем, что по каждой позиции хватает склада */
  for (const item of items) {
    const pid = item.product_id;
    if (pid == null) continue;
    const product = await get('SELECT id, name, stock_qty FROM products WHERE id=?', [pid]);
    if (!product) continue;
    const sq = product.stock_qty == null || product.stock_qty === undefined ? -1 : Number(product.stock_qty);
    if (sq === -1) continue;
    const qty = Number(item.qty) || 0;
    if (qty < 1) continue;
    if (sq < qty) {
      return {
        ok: false,
        code: 'INSUFFICIENT_STOCK',
        message: `Недостаточно «${product.name}»: нужно ${qty}, на складе ${sq}`,
      };
    }
  }

  for (const item of items) {
    const pid = item.product_id;
    if (pid == null) continue;
    const product = await get('SELECT id, stock_qty FROM products WHERE id=?', [pid]);
    if (!product) continue;
    const sq = product.stock_qty == null || product.stock_qty === undefined ? -1 : Number(product.stock_qty);
    if (sq === -1) continue;
    const qty = Number(item.qty) || 0;
    const nextQty = sq - qty;
    await run('UPDATE products SET stock_qty=?, in_stock=? WHERE id=?', [nextQty, nextQty > 0 ? 1 : 0, pid]);
  }

  return { ok: true };
}

async function restoreStock(items) {
  for (const item of items) {
    const pid = item.product_id;
    if (pid == null) continue;
    const product = await get('SELECT id, stock_qty FROM products WHERE id=?', [pid]);
    if (!product) continue;
    const sq = product.stock_qty == null || product.stock_qty === undefined ? -1 : Number(product.stock_qty);
    if (sq === -1) continue;
    const qty = Number(item.qty) || 0;
    const nextQty = sq + qty;
    await run('UPDATE products SET stock_qty=?, in_stock=? WHERE id=?', [nextQty, 1, pid]);
  }
}

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

  if (next === 'done' && prev !== 'done') {
    const r = await deductStock(items);
    if (!r.ok) return r;
  } else if (next === 'cancelled' && prev === 'done') {
    await restoreStock(items);
  }

  await run('UPDATE orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [next, id]);
  const order = await get('SELECT * FROM orders WHERE id=?', [id]);
  return { ok: true, order, prev, next, skipped: false };
}
