import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { all, get, run } from './db.js';
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
    // allow server-to-server, curl, Telegram WebView etc.
    if (!origin) return cb(null, true);
    // allow localhost dev + admin + configured frontend URL
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

initBot(process.env.BOT_TOKEN, OWNER_CHAT_ID, FRONTEND_URL);

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
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

// Admin: upload image/file -> returns URL
app.post('/api/admin/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `${publicBaseUrl(req)}/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, size: req.file.size });
});

// Categories
app.get('/api/categories', (req, res) => {
  res.json(all('SELECT * FROM categories ORDER BY sort_order'));
});

// Admin: create/update category (including image_url)
app.get('/api/admin/categories', requireAdmin, (req, res) => {
  res.json(all('SELECT * FROM categories ORDER BY sort_order, name'));
});

app.post('/api/admin/categories', requireAdmin, (req, res) => {
  const { name, slug, emoji, description, sort_order = 0, image_url = null } = req.body || {};
  if (!name || !slug || !emoji) return res.status(400).json({ error: 'Missing fields' });
  const r = run(
    'INSERT INTO categories (name,slug,emoji,description,sort_order,image_url) VALUES (?,?,?,?,?,?)',
    [name, slug, emoji, description || null, sort_order || 0, image_url]
  );
  res.json(get('SELECT * FROM categories WHERE id=?', [r.lastInsertRowid]));
});

app.put('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const current = get('SELECT * FROM categories WHERE id=?', [id]);
  if (!current) return res.status(404).json({ error: 'Not found' });
  const next = { ...current, ...(req.body || {}) };
  run(
    'UPDATE categories SET name=?, slug=?, emoji=?, description=?, sort_order=?, image_url=? WHERE id=?',
    [next.name, next.slug, next.emoji, next.description || null, Number(next.sort_order || 0), next.image_url || null, id]
  );
  res.json(get('SELECT * FROM categories WHERE id=?', [id]));
});

// Admin: create/update brand
app.get('/api/admin/brands', requireAdmin, (req, res) => {
  const { category_id } = req.query;
  if (category_id) {
    return res.json(all('SELECT * FROM brands WHERE category_id=? ORDER BY sort_order, name', [Number(category_id)]));
  }
  return res.json(all('SELECT * FROM brands ORDER BY category_id, sort_order, name'));
});

app.post('/api/admin/brands', requireAdmin, (req, res) => {
  const { category_id, name, slug, sort_order = 0, image_url = null } = req.body || {};
  if (!category_id || !name || !slug) return res.status(400).json({ error: 'Missing fields' });
  const r = run(
    'INSERT INTO brands (category_id,name,slug,sort_order,image_url) VALUES (?,?,?,?,?)',
    [category_id, name, slug, sort_order || 0, image_url]
  );
  res.json(get('SELECT * FROM brands WHERE id=?', [r.lastInsertRowid]));
});

app.put('/api/admin/brands/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const current = get('SELECT * FROM brands WHERE id=?', [id]);
  if (!current) return res.status(404).json({ error: 'Not found' });
  const next = { ...current, ...(req.body || {}) };
  run(
    'UPDATE brands SET category_id=?, name=?, slug=?, sort_order=?, image_url=? WHERE id=?',
    [Number(next.category_id), next.name, next.slug, Number(next.sort_order || 0), next.image_url || null, id]
  );
  res.json(get('SELECT * FROM brands WHERE id=?', [id]));
});

// Admin: create/update product (including image_url + brand_id)
app.get('/api/admin/products', requireAdmin, (req, res) => {
  const { category_id, brand_id, q } = req.query;
  const where = [];
  const params = [];
  if (category_id) { where.push('category_id=?'); params.push(Number(category_id)); }
  if (brand_id) { where.push('brand_id=?'); params.push(Number(brand_id)); }
  if (q && String(q).trim()) {
    where.push('(name LIKE ? OR COALESCE(brand,"") LIKE ? OR COALESCE(description,"") LIKE ?)');
    const like = `%${String(q).trim()}%`;
    params.push(like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  res.json(all(`SELECT * FROM products ${w} ORDER BY sort_order, name`, params));
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
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
  const r = run(
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
  res.json(get('SELECT * FROM products WHERE id=?', [r.lastInsertRowid]));
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const current = get('SELECT * FROM products WHERE id=?', [id]);
  if (!current) return res.status(404).json({ error: 'Not found' });
  const next = { ...current, ...(req.body || {}) };
  let sq;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'stock_qty')) {
    const v = (req.body || {}).stock_qty;
    if (v === null || v === undefined || v === '') sq = -1;
    else sq = Number(v);
  } else {
    sq = current.stock_qty != null ? Number(current.stock_qty) : -1;
  }
  run(
    `UPDATE products
     SET category_id=?, brand_id=?, name=?, brand=?, description=?, price=?, old_price=?, volume=?, nicotine=?,
         in_stock=?, sort_order=?, image_url=?, stock_qty=?
     WHERE id=?`,
    [
      Number(next.category_id),
      next.brand_id == null ? null : Number(next.brand_id),
      next.name,
      next.brand || null,
      next.description || null,
      Number(next.price),
      next.old_price == null ? null : Number(next.old_price),
      next.volume || null,
      next.nicotine || null,
      Number(next.in_stock ? 1 : 0),
      Number(next.sort_order || 0),
      next.image_url || null,
      Number.isFinite(sq) ? sq : -1,
      id,
    ]
  );
  res.json(get('SELECT * FROM products WHERE id=?', [id]));
});

// Brands (subcategories)
app.get('/api/brands', (req, res) => {
  const { category } = req.query; // category slug
  if (!category) return res.status(400).json({ error: 'Missing category' });
  const rows = all(
    `SELECT b.* FROM brands b
     JOIN categories c ON c.id = b.category_id
     WHERE c.slug = ?
     ORDER BY b.sort_order, b.name`,
    [category]
  );
  res.json(rows);
});

function productAvailableSQL(alias) {
  const a = alias ? `${alias}.` : '';
  return `${a}in_stock=1 AND (COALESCE(${a}stock_qty,-1) = -1 OR ${a}stock_qty > 0)`;
}

// Products
app.get('/api/products', (req, res) => {
  const { category, brand } = req.query; // slugs

  if (!category) {
    return res.json(all(`SELECT * FROM products WHERE ${productAvailableSQL('')} ORDER BY sort_order,name`));
  }

  if (brand) {
    return res.json(all(
      `SELECT p.* FROM products p
       JOIN categories c ON p.category_id=c.id
       JOIN brands b ON b.id = p.brand_id
       WHERE c.slug=? AND b.slug=? AND ${productAvailableSQL('p')}
       ORDER BY p.sort_order,p.name`,
      [category, brand]
    ));
  }

  return res.json(all(
    `SELECT p.* FROM products p JOIN categories c ON p.category_id=c.id WHERE c.slug=? AND ${productAvailableSQL('p')} ORDER BY p.sort_order,p.name`,
    [category]
  ));
});

// Orders - create
app.post('/api/orders', (req, res) => {
  const { telegram_user_id, telegram_username, telegram_first_name, items, customer_note } = req.body;
  if (!telegram_user_id || !items?.length) return res.status(400).json({ error: 'Missing fields' });

  let total = 0;
  const enriched = [];
  for (const item of items) {
    if (!item.product_id || !item.qty || item.qty < 1) {
      return res.status(400).json({ error: 'Invalid cart item' });
    }
    const product = get('SELECT * FROM products WHERE id=?', [item.product_id]);
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

  const result = run(
    'INSERT INTO orders (telegram_user_id,telegram_username,telegram_first_name,items,total,customer_note) VALUES (?,?,?,?,?,?)',
    [telegram_user_id, telegram_username||null, telegram_first_name||null, JSON.stringify(enriched), total, customer_note||null]
  );

  for (const item of items) {
    const product = get('SELECT * FROM products WHERE id=?', [item.product_id]);
    const sq = product.stock_qty == null || product.stock_qty === undefined ? -1 : Number(product.stock_qty);
    if (sq !== -1) {
      const next = sq - item.qty;
      run('UPDATE products SET stock_qty=?, in_stock=? WHERE id=?', [next, next > 0 ? 1 : 0, product.id]);
    }
  }

  const order = get('SELECT * FROM orders WHERE id=?', [result.lastInsertRowid]);
  notifyOwner(OWNER_CHAT_ID, order, enriched);
  notifyCustomer(telegram_user_id, order.id);

  res.json({ success: true, order_id: order.id, total });
});

// Orders - by user
app.get('/api/orders/user/:telegramId', (req, res) => {
  const orders = all('SELECT * FROM orders WHERE telegram_user_id=? ORDER BY created_at DESC', [req.params.telegramId]);
  res.json(orders.map(o => ({ ...o, items: JSON.parse(o.items) })));
});

// --- Admin: analytics, orders, deletes ---
app.get('/api/admin/analytics/summary', requireAdmin, (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
  const overview = get(`
    SELECT
      (SELECT COUNT(*) FROM orders) AS orders_all,
      (SELECT COALESCE(SUM(total),0) FROM orders) AS revenue_all,
      (SELECT COUNT(*) FROM orders WHERE date(created_at) = date('now')) AS orders_today,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE date(created_at) = date('now')) AS revenue_today,
      (SELECT COUNT(*) FROM orders WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')) AS orders_month,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')) AS revenue_month
  `);
  const series = all(
    `SELECT strftime('%Y-%m-%d', created_at) AS d, COUNT(*) AS order_count, COALESCE(SUM(total),0) AS revenue
     FROM orders
     WHERE created_at >= datetime('now', ?)
     GROUP BY strftime('%Y-%m-%d', created_at)
     ORDER BY d ASC`,
    [`-${days} days`]
  );
  const lowStock = all(
    `SELECT * FROM products
     WHERE in_stock=1 AND stock_qty > 0 AND stock_qty <= 5
     ORDER BY stock_qty ASC LIMIT 30`
  );
  res.json({ overview, series, lowStock, days });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const { status } = req.query;
  const rows = status
    ? all(
        'SELECT * FROM orders WHERE status=? ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?',
        [String(status), limit, offset]
      )
    : all(
        'SELECT * FROM orders ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?',
        [limit, offset]
      );
  res.json(rows.map(o => ({ ...o, items: JSON.parse(o.items) })));
});

app.get('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const o = get('SELECT * FROM orders WHERE id=?', [Number(req.params.id)]);
  if (!o) return res.status(404).json({ error: 'Not found' });
  res.json({ ...o, items: JSON.parse(o.items) });
});

app.put('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const cur = get('SELECT * FROM orders WHERE id=?', [id]);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const { status, owner_note, customer_note } = req.body || {};
  const nextStatus = status != null ? String(status) : cur.status;
  const nextOwner = owner_note !== undefined ? owner_note : cur.owner_note;
  const nextCust = customer_note !== undefined ? customer_note : cur.customer_note;
  run(
    'UPDATE orders SET status=?, owner_note=?, customer_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
    [nextStatus, nextOwner || null, nextCust || null, id]
  );
  const o = get('SELECT * FROM orders WHERE id=?', [id]);
  res.json({ ...o, items: JSON.parse(o.items) });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  run('DELETE FROM products WHERE id=?', [Number(req.params.id)]);
  res.json({ ok: true });
});

app.delete('/api/admin/brands/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  run('UPDATE products SET brand_id=NULL WHERE brand_id=?', [id]);
  run('DELETE FROM brands WHERE id=?', [id]);
  res.json({ ok: true });
});

app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const pc = get('SELECT COUNT(*) as c FROM products WHERE category_id=?', [id]);
  if (pc && Number(pc.c) > 0) {
    return res.status(400).json({ error: 'В категории есть товары — сначала удали или перенеси товары' });
  }
  run('DELETE FROM brands WHERE category_id=?', [id]);
  run('DELETE FROM categories WHERE id=?', [id]);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend: http://localhost:${PORT}`);
  console.log(`👑 Owner ID: ${OWNER_CHAT_ID}`);
});
