import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, all, get, run, dialect } from './db.js';
import { initBot, notifyOwner, notifyCustomer } from './bot.js';

const app = express();
const PORT = process.env.PORT || 3001;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allow = new Set([
      FRONTEND_URL,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
    ]);
    if (process.env.ADMIN_URL) allow.add(process.env.ADMIN_URL);
    return cb(null, allow.has(origin));
  }
}));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

function requireAdmin(req, res, next) {
  const token = req.header('x-admin-token');
  if (!process.env.ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN not set' });
  if (token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function publicBaseUrl(req) {
  const proto = (req.header('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = req.header('x-forwarded-host') || req.header('host');
  return `${proto}://${host}`;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const orig = file.originalname || 'file';
      const ext = path.extname(orig).slice(0, 10) || '';
      const safeExt = ext.toLowerCase().match(/^\.[a-z0-9]+$/) ? ext.toLowerCase() : '';
      const name = `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function analyticsOverviewSql() {
  if (dialect === 'pg') {
    return `
    SELECT
      (SELECT COUNT(*)::int FROM orders) AS orders_all,
      (SELECT COALESCE(SUM(total),0) FROM orders) AS revenue_all,
      (SELECT COUNT(*)::int FROM orders WHERE created_at::date = CURRENT_DATE) AS orders_today,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE created_at::date = CURRENT_DATE) AS revenue_today,
      (SELECT COUNT(*)::int FROM orders WHERE to_char(created_at, 'YYYY-MM') = to_char(CURRENT_TIMESTAMP, 'YYYY-MM')) AS orders_month,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE to_char(created_at, 'YYYY-MM') = to_char(CURRENT_TIMESTAMP, 'YYYY-MM')) AS revenue_month
  `;
  }
  return `
    SELECT
      (SELECT COUNT(*) FROM orders) AS orders_all,
      (SELECT COALESCE(SUM(total),0) FROM orders) AS revenue_all,
      (SELECT COUNT(*) FROM orders WHERE date(created_at) = date('now')) AS orders_today,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE date(created_at) = date('now')) AS revenue_today,
      (SELECT COUNT(*) FROM orders WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')) AS orders_month,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')) AS revenue_month
  `;
}

function analyticsSeriesSql() {
  if (dialect === 'pg') {
    return `
    SELECT to_char(created_at, 'YYYY-MM-DD') AS d, COUNT(*)::int AS order_count, COALESCE(SUM(total),0) AS revenue
    FROM orders
    WHERE created_at >= CURRENT_TIMESTAMP - (?::int * INTERVAL '1 day')
    GROUP BY to_char(created_at, 'YYYY-MM-DD')
    ORDER BY d ASC
  `;
  }
  return `
    SELECT strftime('%Y-%m-%d', created_at) AS d, COUNT(*) AS order_count, COALESCE(SUM(total),0) AS revenue
    FROM orders
    WHERE created_at >= datetime('now', ?)
    GROUP BY strftime('%Y-%m-%d', created_at)
    ORDER BY d ASC
  `;
}

/** Один литерал `''` в SQL — совместим и с SQLite, и с Postgres */
function productSearchWhere() {
  return '(name LIKE ? OR COALESCE(brand,\'\') LIKE ? OR COALESCE(description,\'\') LIKE ?)';
}

// Admin: upload
app.post('/api/admin/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `${publicBaseUrl(req)}/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, size: req.file.size });
});

app.get('/api/categories', async (_req, res, next) => {
  try {
    res.json(await all('SELECT * FROM categories ORDER BY sort_order'));
  } catch (e) { next(e); }
});

app.get('/api/admin/categories', requireAdmin, async (_req, res, next) => {
  try {
    res.json(await all('SELECT * FROM categories ORDER BY sort_order, name'));
  } catch (e) { next(e); }
});

app.post('/api/admin/categories', requireAdmin, async (req, res, next) => {
  try {
    const { name, slug, emoji, description, sort_order = 0, image_url = null } = req.body || {};
    if (!name || !slug || !emoji) return res.status(400).json({ error: 'Missing fields' });
    const r = await run(
      'INSERT INTO categories (name,slug,emoji,description,sort_order,image_url) VALUES (?,?,?,?,?,?)',
      [name, slug, emoji, description || null, sort_order || 0, image_url]
    );
    res.json(await get('SELECT * FROM categories WHERE id=?', [r.lastInsertRowid]));
  } catch (e) { next(e); }
});

app.put('/api/admin/categories/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = await get('SELECT * FROM categories WHERE id=?', [id]);
    if (!current) return res.status(404).json({ error: 'Not found' });
    const nextBody = { ...current, ...(req.body || {}) };
    await run(
      'UPDATE categories SET name=?, slug=?, emoji=?, description=?, sort_order=?, image_url=? WHERE id=?',
      [nextBody.name, nextBody.slug, nextBody.emoji, nextBody.description || null, Number(nextBody.sort_order || 0), nextBody.image_url || null, id]
    );
    res.json(await get('SELECT * FROM categories WHERE id=?', [id]));
  } catch (e) { next(e); }
});

app.get('/api/admin/brands', requireAdmin, async (req, res, next) => {
  try {
    const { category_id } = req.query;
    if (category_id) {
      return res.json(await all('SELECT * FROM brands WHERE category_id=? ORDER BY sort_order, name', [Number(category_id)]));
    }
    return res.json(await all('SELECT * FROM brands ORDER BY category_id, sort_order, name'));
  } catch (e) { next(e); }
});

app.post('/api/admin/brands', requireAdmin, async (req, res, next) => {
  try {
    const { category_id, name, slug, sort_order = 0, image_url = null } = req.body || {};
    if (!category_id || !name || !slug) return res.status(400).json({ error: 'Missing fields' });
    const r = await run(
      'INSERT INTO brands (category_id,name,slug,sort_order,image_url) VALUES (?,?,?,?,?)',
      [category_id, name, slug, sort_order || 0, image_url]
    );
    res.json(await get('SELECT * FROM brands WHERE id=?', [r.lastInsertRowid]));
  } catch (e) { next(e); }
});

app.put('/api/admin/brands/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = await get('SELECT * FROM brands WHERE id=?', [id]);
    if (!current) return res.status(404).json({ error: 'Not found' });
    const nextBody = { ...current, ...(req.body || {}) };
    await run(
      'UPDATE brands SET category_id=?, name=?, slug=?, sort_order=?, image_url=? WHERE id=?',
      [Number(nextBody.category_id), nextBody.name, nextBody.slug, Number(nextBody.sort_order || 0), nextBody.image_url || null, id]
    );
    res.json(await get('SELECT * FROM brands WHERE id=?', [id]));
  } catch (e) { next(e); }
});

app.get('/api/admin/products', requireAdmin, async (req, res, next) => {
  try {
    const { category_id, brand_id, q } = req.query;
    const where = [];
    const params = [];
    if (category_id) { where.push('category_id=?'); params.push(Number(category_id)); }
    if (brand_id) { where.push('brand_id=?'); params.push(Number(brand_id)); }
    if (q && String(q).trim()) {
      where.push(productSearchWhere());
      const like = `%${String(q).trim()}%`;
      params.push(like, like, like);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    res.json(await all(`SELECT * FROM products ${w} ORDER BY sort_order, name`, params));
  } catch (e) { next(e); }
});

app.post('/api/admin/products', requireAdmin, async (req, res, next) => {
  try {
    const {
      category_id, brand_id = null,
      name, description = null,
      price, old_price = null,
      volume = null, nicotine = null,
      in_stock = 1, sort_order = 0,
      image_url = null,
      stock_qty = -1,
    } = req.body || {};
    if (!category_id || !name || price == null) return res.status(400).json({ error: 'Missing fields' });
    const sq = stock_qty === null || stock_qty === undefined || stock_qty === '' ? -1 : Number(stock_qty);
    const r = await run(
      `INSERT INTO products (category_id,brand_id,name,description,price,old_price,volume,nicotine,in_stock,sort_order,image_url,stock_qty)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        category_id,
        brand_id,
        name,
        description,
        price,
        old_price,
        volume,
        nicotine,
        Number(in_stock ? 1 : 0),
        Number(sort_order || 0),
        image_url,
        Number.isFinite(sq) ? sq : -1,
      ]
    );
    res.json(await get('SELECT * FROM products WHERE id=?', [r.lastInsertRowid]));
  } catch (e) { next(e); }
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = await get('SELECT * FROM products WHERE id=?', [id]);
    if (!current) return res.status(404).json({ error: 'Not found' });
    const nextBody = { ...current, ...(req.body || {}) };
    let sq;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'stock_qty')) {
      const v = (req.body || {}).stock_qty;
      if (v === null || v === undefined || v === '') sq = -1;
      else sq = Number(v);
    } else {
      sq = current.stock_qty != null ? Number(current.stock_qty) : -1;
    }
    await run(
      `UPDATE products
       SET category_id=?, brand_id=?, name=?, brand=?, description=?, price=?, old_price=?, volume=?, nicotine=?,
           in_stock=?, sort_order=?, image_url=?, stock_qty=?
       WHERE id=?`,
      [
        Number(nextBody.category_id),
        nextBody.brand_id == null ? null : Number(nextBody.brand_id),
        nextBody.name,
        nextBody.brand || null,
        nextBody.description || null,
        Number(nextBody.price),
        nextBody.old_price == null ? null : Number(nextBody.old_price),
        nextBody.volume || null,
        nextBody.nicotine || null,
        Number(nextBody.in_stock ? 1 : 0),
        Number(nextBody.sort_order || 0),
        nextBody.image_url || null,
        Number.isFinite(sq) ? sq : -1,
        id,
      ]
    );
    res.json(await get('SELECT * FROM products WHERE id=?', [id]));
  } catch (e) { next(e); }
});

app.get('/api/brands', async (req, res, next) => {
  try {
    const { category } = req.query;
    if (!category) return res.status(400).json({ error: 'Missing category' });
    const rows = await all(
      `SELECT b.* FROM brands b
       JOIN categories c ON c.id = b.category_id
       WHERE c.slug = ?
       ORDER BY b.sort_order, b.name`,
      [category]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

function productAvailableSQL(alias) {
  const a = alias ? `${alias}.` : '';
  return `${a}in_stock=1 AND (COALESCE(${a}stock_qty,-1) = -1 OR ${a}stock_qty > 0)`;
}

app.get('/api/products', async (req, res, next) => {
  try {
    const { category, brand } = req.query;

    if (!category) {
      return res.json(await all(`SELECT * FROM products WHERE ${productAvailableSQL('')} ORDER BY sort_order,name`));
    }

    if (brand) {
      return res.json(await all(
        `SELECT p.* FROM products p
         JOIN categories c ON p.category_id=c.id
         JOIN brands b ON b.id = p.brand_id
         WHERE c.slug=? AND b.slug=? AND ${productAvailableSQL('p')}
         ORDER BY p.sort_order,p.name`,
        [category, brand]
      ));
    }

    return res.json(await all(
      `SELECT p.* FROM products p JOIN categories c ON p.category_id=c.id WHERE c.slug=? AND ${productAvailableSQL('p')} ORDER BY p.sort_order,p.name`,
      [category]
    ));
  } catch (e) { next(e); }
});

app.post('/api/orders', async (req, res, next) => {
  try {
    const { telegram_user_id, telegram_username, telegram_first_name, items, customer_note } = req.body;
    if (!telegram_user_id || !items?.length) return res.status(400).json({ error: 'Missing fields' });

    let total = 0;
    const enriched = [];
    for (const item of items) {
      if (!item.product_id || !item.qty || item.qty < 1) {
        return res.status(400).json({ error: 'Invalid cart item' });
      }
      const product = await get('SELECT * FROM products WHERE id=?', [item.product_id]);
      if (!product) return res.status(400).json({ error: `Product ${item.product_id} not found` });
      const sq = product.stock_qty == null || product.stock_qty === undefined ? -1 : Number(product.stock_qty);
      if (sq !== -1) {
        if (item.qty > sq) {
          return res.status(400).json({ error: `Недостаточно остатка: ${product.name} (доступно ${sq})` });
        }
      } else {
        if (!product.in_stock) {
          return res.status(400).json({ error: `Товар недоступен: ${product.name}` });
        }
      }
      total += product.price * item.qty;
      enriched.push({ ...item, name: product.name, price: product.price });
    }

    const result = await run(
      'INSERT INTO orders (telegram_user_id,telegram_username,telegram_first_name,items,total,customer_note) VALUES (?,?,?,?,?,?)',
      [telegram_user_id, telegram_username || null, telegram_first_name || null, JSON.stringify(enriched), total, customer_note || null]
    );

    for (const item of items) {
      const product = await get('SELECT * FROM products WHERE id=?', [item.product_id]);
      const sq = product.stock_qty == null || product.stock_qty === undefined ? -1 : Number(product.stock_qty);
      if (sq !== -1) {
        const nextQty = sq - item.qty;
        await run('UPDATE products SET stock_qty=?, in_stock=? WHERE id=?', [nextQty, nextQty > 0 ? 1 : 0, product.id]);
      }
    }

    const order = await get('SELECT * FROM orders WHERE id=?', [result.lastInsertRowid]);
    notifyOwner(OWNER_CHAT_ID, order, enriched);
    notifyCustomer(telegram_user_id, order.id);

    res.json({ success: true, order_id: order.id, total });
  } catch (e) { next(e); }
});

app.get('/api/orders/user/:telegramId', async (req, res, next) => {
  try {
    const orders = await all('SELECT * FROM orders WHERE telegram_user_id=? ORDER BY created_at DESC', [req.params.telegramId]);
    res.json(orders.map(o => ({ ...o, items: JSON.parse(o.items) })));
  } catch (e) { next(e); }
});

app.get('/api/admin/analytics/summary', requireAdmin, async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    const overview = await get(analyticsOverviewSql());
    const seriesParam = dialect === 'pg' ? days : `-${days} days`;
    const series = await all(analyticsSeriesSql(), [seriesParam]);
    const lowStock = await all(
      `SELECT * FROM products
       WHERE in_stock=1 AND stock_qty > 0 AND stock_qty <= 5
       ORDER BY stock_qty ASC LIMIT 30`
    );
    res.json({ overview, series, lowStock, days });
  } catch (e) { next(e); }
});

app.get('/api/admin/orders', requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const { status } = req.query;
    const rows = status
      ? await all(
        'SELECT * FROM orders WHERE status=? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [String(status), limit, offset]
      )
      : await all(
        'SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset]
      );
    res.json(rows.map(o => ({ ...o, items: JSON.parse(o.items) })));
  } catch (e) { next(e); }
});

app.get('/api/admin/orders/:id', requireAdmin, async (req, res, next) => {
  try {
    const o = await get('SELECT * FROM orders WHERE id=?', [Number(req.params.id)]);
    if (!o) return res.status(404).json({ error: 'Not found' });
    res.json({ ...o, items: JSON.parse(o.items) });
  } catch (e) { next(e); }
});

app.put('/api/admin/orders/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = await get('SELECT * FROM orders WHERE id=?', [id]);
    if (!cur) return res.status(404).json({ error: 'Not found' });
    const { status, owner_note, customer_note } = req.body || {};
    const nextStatus = status != null ? String(status) : cur.status;
    const nextOwner = owner_note !== undefined ? owner_note : cur.owner_note;
    const nextCust = customer_note !== undefined ? customer_note : cur.customer_note;
    await run(
      'UPDATE orders SET status=?, owner_note=?, customer_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [nextStatus, nextOwner || null, nextCust || null, id]
    );
    const o = await get('SELECT * FROM orders WHERE id=?', [id]);
    res.json({ ...o, items: JSON.parse(o.items) });
  } catch (e) { next(e); }
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res, next) => {
  try {
    await run('DELETE FROM products WHERE id=?', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.delete('/api/admin/brands/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await run('UPDATE products SET brand_id=NULL WHERE brand_id=?', [id]);
    await run('DELETE FROM brands WHERE id=?', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.delete('/api/admin/categories/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pc = await get('SELECT COUNT(*) as c FROM products WHERE category_id=?', [id]);
    if (pc && Number(pc.c) > 0) {
      return res.status(400).json({ error: 'В категории есть товары — сначала удали или перенеси товары' });
    }
    await run('DELETE FROM brands WHERE category_id=?', [id]);
    await run('DELETE FROM categories WHERE id=?', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function main() {
  await initDb();
  initBot(app, process.env.BOT_TOKEN, OWNER_CHAT_ID, FRONTEND_URL);
  app.listen(PORT, () => {
    console.log(`🚀 Backend: http://localhost:${PORT}`);
    console.log(`👑 Owner ID: ${OWNER_CHAT_ID}`);
    console.log(`🗄  DB dialect: ${dialect}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
