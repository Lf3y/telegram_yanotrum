/**
 * Резерв и возврат остатков при жизненном цикле заказа.
 * Резерв — при оформлении; возврат — при отмене (если ещё не возвращали).
 */

/**
 * @param {{ get: Function, run: Function }} db
 * @param {Array<{ product_id: number, qty: number, name?: string }>} items
 * @param {(product: object) => string} [formatName]
 * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string }>}
 */
export async function reserveStock(db, items, formatName) {
  for (const item of items) {
    const pid = item.product_id;
    if (pid == null) continue;
    const qty = Number(item.qty) || 0;
    if (qty < 1) continue;

    const product = await db.get(
      'SELECT id, name, brand, stock_qty, in_stock FROM products WHERE id=?',
      [pid],
    );
    if (!product) {
      return { ok: false, code: 'NOT_FOUND', message: `Товар #${pid} не найден` };
    }

    const sq = product.stock_qty == null || product.stock_qty === undefined
      ? -1
      : Number(product.stock_qty);

    const label = formatName ? formatName(product) : String(product.name || `#${pid}`);

    if (sq === -1) {
      if (!product.in_stock) {
        return { ok: false, code: 'UNAVAILABLE', message: `Товар недоступен: ${label}` };
      }
      continue;
    }

    const upd = await db.run(
      `UPDATE products
       SET stock_qty = stock_qty - ?,
           in_stock = CASE WHEN stock_qty - ? > 0 THEN 1 ELSE 0 END
       WHERE id = ? AND stock_qty >= ?`,
      [qty, qty, pid, qty],
    );

    if (!upd.changes) {
      const fresh = await db.get('SELECT stock_qty FROM products WHERE id=?', [pid]);
      const available = fresh?.stock_qty != null ? Number(fresh.stock_qty) : 0;
      return {
        ok: false,
        code: 'INSUFFICIENT_STOCK',
        message: `Недостаточно остатка: ${label} (доступно ${available})`,
      };
    }
  }

  return { ok: true };
}

/**
 * @param {{ get: Function, run: Function }} db
 * @param {Array<{ product_id: number, qty: number }>} items
 */
export async function restoreStock(db, items) {
  for (const item of items) {
    const pid = item.product_id;
    if (pid == null) continue;
    const product = await db.get('SELECT id, stock_qty FROM products WHERE id=?', [pid]);
    if (!product) continue;
    const sq = product.stock_qty == null || product.stock_qty === undefined
      ? -1
      : Number(product.stock_qty);
    if (sq === -1) continue;
    const qty = Number(item.qty) || 0;
    if (qty < 1) continue;
    const nextQty = sq + qty;
    await db.run(
      'UPDATE products SET stock_qty=?, in_stock=? WHERE id=?',
      [nextQty, 1, pid],
    );
  }
}
