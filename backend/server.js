import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, all, get, run, dialect, slugify, withTransaction } from './db.js';
import { initBot, notifyOwner, notifyCustomer, notifyCustomerOrderStatus } from './bot.js';
import { transitionOrderStatus } from './orderStatus.js';
import { runProductImport } from './importProducts.js';
import { reserveStock } from './stock.js';
import { blockedUserMessage, getBlockStatus } from './blockedUsers.js';
import { adviseProducts } from './aiAdvisor.js';
import { fetchExternalImage, parseAllowedImageUrl } from './mediaProxy.js';
import { isCloudinaryEnabled, uploadImageBuffer } from './imageStorage.js';

const app = express();
app.set('trust proxy', 1);
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
      'https://telegram-yanotrum-client.onrender.com',
      'https://vape-shop-frontend.onrender.com',
    ]);
    if (process.env.ADMIN_URL) allow.add(process.env.ADMIN_URL);
    return cb(null, allow.has(origin));
  }
}));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

/** Прокси внешних картинок для Mini App (VK и др.) */
app.get('/api/media', async (req, res, next) => {
  try {
    const raw = req.query.url;
    if (!parseAllowedImageUrl(String(raw || ''))) {
      return res.status(400).json({ error: 'Invalid or disallowed image URL' });
    }
    const { buffer, contentType } = await fetchExternalImage(String(raw));
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (e) {
    if (e?.code === 'BAD_URL') return res.status(400).json({ error: e.message });
    if (e?.code === 'UPSTREAM' || e?.code === 'NOT_IMAGE') return res.status(502).json({ error: e.message });
    next(e);
  }
});

function requireAdmin(req, res, next) {
  const token = req.header('x-admin-token');
  if (!process.env.ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN not set' });
  if (token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function publicBaseUrl(req) {
  const envBase = (process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_BASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (envBase) return envBase;
  const proto = (req.header('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = req.header('x-forwarded-host') || req.header('host');
  return `${proto}://${host}`;
}

/** @param {string|null|undefined} url @param {import('express').Request} req */
function normalizeImageUrl(url, req) {
  if (!url) return url;
  const s = String(url).trim();
  if (!s) return null;
  const base = publicBaseUrl(req);
  if (/^https?:\/\//i.test(s)) {
    return s
      .replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, base)
      .replace(/^http:\/\//i, 'https://');
  }
  if (s.startsWith('/')) return `${base}${s}`;
  return s;
}

/** @param {Record<string, unknown>} row @param {import('express').Request} req */
function withNormalizedImages(row, req) {
  if (!row || typeof row !== 'object') return row;
  const o = { ...row };
  if ('image_url' in o) o.image_url = normalizeImageUrl(o.image_url, req);
  return o;
}

/** @param {Record<string, unknown>[]} rows @param {import('express').Request} req */
function withNormalizedImagesList(rows, req) {
  return (rows || []).map((r) => withNormalizedImages(r, req));
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

/** Загрузка в память → Cloudinary или fallback на диск. */
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

/** Импорт каталога из Excel: только в память, до 25 МБ. */
const uploadImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function handleImportMulter(req, res, next) {
  uploadImport.single('file')(req, res, err => {
    if (err) {
      console.error('Multer import:', err?.message || err);
      return res.status(400).json({ error: String(err.message || err || 'Ошибка загрузки файла') });
    }
    next();
  });
}

function analyticsOverviewSql() {
  if (dialect === 'pg') {
    return `
    SELECT
      (SELECT COUNT(*)::int FROM orders) AS orders_all,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE status = 'done') AS revenue_all,
      (SELECT COUNT(*)::int FROM orders WHERE created_at::date = CURRENT_DATE) AS orders_today,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE status = 'done' AND created_at::date = CURRENT_DATE) AS revenue_today,
      (SELECT COUNT(*)::int FROM orders WHERE to_char(created_at, 'YYYY-MM') = to_char(CURRENT_TIMESTAMP, 'YYYY-MM')) AS orders_month,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE status = 'done' AND to_char(created_at, 'YYYY-MM') = to_char(CURRENT_TIMESTAMP, 'YYYY-MM')) AS revenue_month
  `;
  }
  return `
    SELECT
      (SELECT COUNT(*) FROM orders) AS orders_all,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE status = 'done') AS revenue_all,
      (SELECT COUNT(*) FROM orders WHERE date(created_at) = date('now')) AS orders_today,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE status = 'done' AND date(created_at) = date('now')) AS revenue_today,
      (SELECT COUNT(*) FROM orders WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')) AS orders_month,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE status = 'done' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')) AS revenue_month
  `;
}

function analyticsSeriesSql() {
  if (dialect === 'pg') {
    return `
    SELECT to_char(created_at, 'YYYY-MM-DD') AS d, COUNT(*)::int AS order_count, COALESCE(SUM(total),0) AS revenue
    FROM orders
    WHERE status = 'done' AND created_at >= CURRENT_TIMESTAMP - (?::int * INTERVAL '1 day')
    GROUP BY to_char(created_at, 'YYYY-MM-DD')
    ORDER BY d ASC
  `;
  }
  return `
    SELECT strftime('%Y-%m-%d', created_at) AS d, COUNT(*) AS order_count, COALESCE(SUM(total),0) AS revenue
    FROM orders
    WHERE status = 'done' AND created_at >= datetime('now', ?)
    GROUP BY strftime('%Y-%m-%d', created_at)
    ORDER BY d ASC
  `;
}

/** Один литерал `''` в SQL — совместим и с SQLite, и с Postgres */
function productSearchWhere() {
  return '(name LIKE ? OR COALESCE(brand,\'\') LIKE ? OR COALESCE(description,\'\') LIKE ?)';
}

// Admin: upload (Cloudinary на проде, локальный uploads — для dev)
app.post('/api/admin/upload', requireAdmin, uploadMemory.single('file'), async (req, res, next) => {
  try {
    if (!req.file?.buffer?.length) return res.status(400).json({ error: 'No file' });

    if (isCloudinaryEnabled()) {
      const url = await uploadImageBuffer(req.file.buffer, req.file.originalname || 'image');
      return res.json({
        url,
        filename: req.file.originalname || 'image',
        size: req.file.size,
        storage: 'cloudinary',
      });
    }

    const orig = req.file.originalname || 'file';
    const ext = path.extname(orig).slice(0, 10) || '';
    const safeExt = ext.toLowerCase().match(/^\.[a-z0-9]+$/) ? ext.toLowerCase() : '';
    const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), req.file.buffer);
    const url = `${publicBaseUrl(req)}/uploads/${filename}`;
    res.json({ url, filename, size: req.file.size, storage: 'local' });
  } catch (e) {
    next(e);
  }
});

/** Массовый импорт товаров из Excel/CSV (`importProducts.js`). */
app.post('/api/admin/import/products', requireAdmin, handleImportMulter, async (req, res, next) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'Приложите файл .xlsx, .xls или .csv в поле «file»' });
    }
    const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
    const force = req.query.force === '1' || req.query.force === 'true';
    const replaceAll = req.query.replace_all === '1' || req.query.replace_all === 'true';
    const result = await runProductImport(req.file.buffer, req.file.originalname || 'import.xlsx', {
      dryRun,
      force,
      replaceAll,
    });
    res.json(result);
  } catch (e) {
    console.error('POST /api/admin/import/products:', e?.stack || e?.message || e);
    /** Явное тело ошибки для админки (не голый Internal server error). */
    res.status(500).json({
      ok: false,
      error: e?.message || String(e),
      code: e?.code,
    });
  }
});

app.get('/api/categories', async (req, res, next) => {
  try {
    res.json(withNormalizedImagesList(await all('SELECT * FROM categories ORDER BY sort_order'), req));
  } catch (e) { next(e); }
});

app.get('/api/admin/categories', requireAdmin, async (req, res, next) => {
  try {
    res.json(withNormalizedImagesList(await all('SELECT * FROM categories ORDER BY sort_order, name'), req));
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
    const merged = { ...current, ...(req.body || {}) };
    const name = String(merged.name ?? '').trim();
    const slug = String(merged.slug ?? '').trim();
    let emoji = String(merged.emoji ?? '').trim() || '🛍';
    if (emoji.length > 24) emoji = emoji.slice(0, 24);
    const description =
      merged.description === undefined || merged.description === null
        ? null
        : String(merged.description).trim() || null;
    let sortOrder = Number(merged.sort_order);
    if (!Number.isFinite(sortOrder)) sortOrder = 0;
    const imageUrl =
      merged.image_url === undefined || merged.image_url === null || merged.image_url === ''
        ? null
        : String(merged.image_url).trim();

    if (!name || !slug) {
      return res.status(400).json({ error: 'Нужны непустые название и slug категории' });
    }

    try {
      await run(
        'UPDATE categories SET name=?, slug=?, emoji=?, description=?, sort_order=?, image_url=? WHERE id=?',
        [name, slug, emoji, description, sortOrder, imageUrl, id],
      );
    } catch (dbErr) {
      const dupSlug =
        dbErr?.code === '23505'
        || (dialect === 'sqlite' && /UNIQUE constraint failed.*categories.slug/i.test(String(dbErr?.message || '')));
      if (dupSlug) {
        return res.status(409).json({ error: 'Категория с таким slug уже существует — задайте другой slug' });
      }
      throw dbErr;
    }
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
    res.json(withNormalizedImagesList(rows, req));
  } catch (e) { next(e); }
});

function productAvailableSQL(alias) {
  const a = alias ? `${alias}.` : '';
  return `${a}in_stock=1 AND (COALESCE(${a}stock_qty,-1) = -1 OR ${a}stock_qty > 0)`;
}

/** Полная строка позиции для заказов и Telegram: бренд + вкус. */
function formatOrderLineName(product) {
  const b = product?.brand ? String(product.brand).trim() : '';
  const n = product?.name != null ? String(product.name).trim() : '';
  if (b) return `${b} · ${n}`;
  return n;
}

/**
 * Нормализованное выражение никотина в SQL (distinct / фильтр).
 * @param {string} alias
 */
function sqlNicotineKey(alias = 'p') {
  const a = alias ? `${alias}.` : '';
  return dialect === 'pg'
    ? `NULLIF(TRIM(COALESCE(${a}nicotine::text, '')), '')`
    : `NULLIF(TRIM(COALESCE(${a}nicotine, '')), '')`;
}

/**
 * Нормализованное выражение объёма в SQL (distinct / фильтр).
 * @param {string} alias
 */
function sqlVolumeKey(alias = 'p') {
  const a = alias ? `${alias}.` : '';
  return dialect === 'pg'
    ? `NULLIF(TRIM(COALESCE(${a}volume::text, '')), '')`
    : `NULLIF(TRIM(COALESCE(${a}volume, '')), '')`;
}

/** Строковое значение производителя (поле brand в products). */
function sqlBrandTrim(alias = 'p') {
  const a = alias ? `${alias}.` : '';
  return `TRIM(COALESCE(${a}brand, ''))`;
}

/**
 * @param {Record<string, string | undefined>} q
 */
function parseCatalogFilters(q) {
  const category = q.category?.trim?.() ? String(q.category).trim() : null;
  const brandSlugFromTable = q.brand?.trim?.() ? String(q.brand).trim() : null;
  const producerRaw = q.producer != null ? String(q.producer) : '';
  /** Точное совпадение с полем `products.brand`; пустая строка не считается producer. */
  const producerTrim = producerRaw.trim();
  const producer = producerTrim !== '' ? producerTrim : null;
  /** Только SKU без указанного бренда (`products.brand` пусто). */
  const unbranded = q.unbranded === '1' || q.unbranded === 'true';
  const volumeRaw = q.volume != null ? String(q.volume).trim() : '';
  const volume = volumeRaw !== '' ? volumeRaw : null;
  const nicotineRaw = q.nicotine != null ? String(q.nicotine).trim() : '';
  const nicotine = nicotineRaw !== '' ? nicotineRaw : null;
  const minP = Number.isFinite(Number(q.min_price)) ? Number(q.min_price) : null;
  const maxP = Number.isFinite(Number(q.max_price)) ? Number(q.max_price) : null;
  const qRaw = q.q != null ? String(q.q).trim() : '';
  const searchQuery = qRaw.length >= 2 ? qRaw : null;

  return {
    category,
    brandSlugFromTable,
    volume,
    nicotine,
    minPrice: minP,
    maxPrice: maxP,
    producer,
    unbranded,
    searchQuery,
  };
}

/**
 * Условия по цене / никотину / производителю для каталога.
 * @param {string} columnAlias Префикс колонки, обычно `p`.
 * @param {{
 *   minPrice?: number|null,
 *   maxPrice?: number|null,
 *   volume?: string|null,
 *   nicotine?: string|null,
 *   producer?: string|null,
 * }} parsed
 * @param {{ skipProducer?: boolean }} [opts]
 */
function catalogExtraFiltersSql(columnAlias, parsed, opts = {}) {
  const parts = [];
  const params = [];
  const vk = sqlVolumeKey(columnAlias);
  const nk = sqlNicotineKey(columnAlias);
  const br = sqlBrandTrim(columnAlias);

  if (parsed.minPrice != null && Number.isFinite(parsed.minPrice)) {
    parts.push(`${columnAlias}.price >= ?`);
    params.push(parsed.minPrice);
  }
  if (parsed.maxPrice != null && Number.isFinite(parsed.maxPrice)) {
    parts.push(`${columnAlias}.price <= ?`);
    params.push(parsed.maxPrice);
  }
  if (parsed.volume != null) {
    parts.push(`${vk} = ?`);
    params.push(parsed.volume);
  }
  if (parsed.nicotine != null) {
    parts.push(`${nk} = ?`);
    params.push(parsed.nicotine);
  }
  if (parsed.unbranded && !opts.skipProducer) {
    parts.push(`${br} = ''`);
  } else if (!opts.skipProducer && parsed.producer != null) {
    parts.push(`${br} = ?`);
    params.push(parsed.producer);
  }

  if (parsed.searchQuery) {
    const pattern = `%${parsed.searchQuery}%`;
    const descCol = `${columnAlias}.description`;
    if (dialect === 'pg') {
      parts.push(`(${columnAlias}.name ILIKE ? OR ${br} ILIKE ? OR COALESCE(${descCol}, '') ILIKE ?)`);
    } else {
      parts.push(
        `(${columnAlias}.name LIKE ? COLLATE NOCASE OR ${br} LIKE ? COLLATE NOCASE OR COALESCE(${descCol}, '') LIKE ? COLLATE NOCASE)`,
      );
    }
    params.push(pattern, pattern, pattern);
  }

  const sql = parts.length ? ` AND ${parts.join(' AND ')}` : '';
  return { sql, params };
}

app.get('/api/catalog/brand-groups', async (req, res, next) => {
  try {
    const parsed = parseCatalogFilters(req.query);
    const avail = productAvailableSQL('p');
    const { sql: ex, params: exParams } = catalogExtraFiltersSql('p', parsed, {
      skipProducer: true,
    });

    let sqlText;
    let paramsOut;

    if (parsed.category) {
      sqlText = `
      SELECT TRIM(COALESCE(p.brand,'')) AS brand_raw, COUNT(*) AS cnt
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE c.slug = ? AND ${avail}${ex}
      GROUP BY TRIM(COALESCE(p.brand,''))`;
      if (dialect === 'pg') {
        sqlText += ` ORDER BY cnt DESC NULLS LAST, TRIM(COALESCE(p.brand,'')) ASC`;
      } else {
        sqlText += ` ORDER BY cnt DESC, TRIM(COALESCE(p.brand,'')) COLLATE NOCASE ASC`;
      }
      paramsOut = [parsed.category, ...exParams];
    } else {
      sqlText = `
      SELECT TRIM(COALESCE(p.brand,'')) AS brand_raw, COUNT(*) AS cnt
      FROM products p
      WHERE ${avail}${ex}
      GROUP BY TRIM(COALESCE(p.brand,''))`;
      if (dialect === 'pg') {
        sqlText += ` ORDER BY cnt DESC NULLS LAST, TRIM(COALESCE(p.brand,'')) ASC`;
      } else {
        sqlText += ` ORDER BY cnt DESC, TRIM(COALESCE(p.brand,'')) COLLATE NOCASE ASC`;
      }
      paramsOut = [...exParams];
    }

    const rows = await all(sqlText, paramsOut);

    let data = rows.map((r) => {
      const key = String(r.brand_raw || '').trim();
      return {
        brand: key || null,
        slug: slugify(key || '__no_brand__'),
        count: Number(r.cnt) || 0,
        image_url: null,
      };
    });

    /** Пустые бренды в конце, «осмысленные» сверху. */
    data.sort((a, b) => {
      const az = !a.brand ? 1 : 0;
      const bz = !b.brand ? 1 : 0;
      if (az !== bz) return az - bz;
      return b.count - a.count;
    });

    if (parsed.category) {
      const brandImages = await all(
        `SELECT b.name, b.slug, b.image_url FROM brands b
         JOIN categories c ON c.id = b.category_id
         WHERE c.slug = ?`,
        [parsed.category],
      );
      /** Первая картинка товара с фото по каждому бренду (fallback для плиток). */
      const productThumbs = await all(
        `SELECT TRIM(COALESCE(p.brand,'')) AS brand_raw,
                MIN(p.image_url) AS image_url
         FROM products p
         JOIN categories c ON p.category_id = c.id
         WHERE c.slug = ? AND ${avail}
           AND p.image_url IS NOT NULL AND TRIM(p.image_url) <> ''
         GROUP BY TRIM(COALESCE(p.brand,''))`,
        [parsed.category],
      );
      const bySlug = new Map(
        brandImages.map((b) => [String(b.slug || '').trim(), b.image_url || null]),
      );
      const byName = new Map(
        brandImages.map((b) => [String(b.name || '').trim().toLowerCase(), b.image_url || null]),
      );
      const byProductBrand = new Map(
        productThumbs.map((r) => [
          String(r.brand_raw || '').trim().toLowerCase(),
          r.image_url || null,
        ]),
      );
      data = data.map((g) => ({
        ...g,
        image_url:
          (g.brand ? byProductBrand.get(g.brand.toLowerCase()) : null)
          || bySlug.get(g.slug)
          || (g.brand ? byName.get(g.brand.toLowerCase()) : null)
          || null,
      }));
    }

    res.json(withNormalizedImagesList(data, req));
  } catch (e) {
    console.error('/api/catalog/brand-groups', e?.message || e);
    next(e);
  }
});

app.get('/api/products/filter-meta', async (req, res, next) => {
  try {
    const parsed = parseCatalogFilters(req.query);
    const avail = productAvailableSQL('p');
    const vk = sqlVolumeKey('p');
    const nk = sqlNicotineKey('p');
    /** Метаданные без привязки к конкретному производителю (полный список для фильтра). */
    const { sql: ex, params: exParams } = catalogExtraFiltersSql('p', parsed, {
      skipProducer: true,
    });

    const joinCatSql = parsed.category ? 'JOIN categories c ON p.category_id = c.id' : '';
    const whereCatSql = parsed.category ? ' AND c.slug = ?' : '';
    const baseParams = parsed.category ? [parsed.category, ...exParams] : [...exParams];

    const priceRows = await all(
      `
      SELECT MIN(p.price) AS mn, MAX(p.price) AS mx FROM products p
      ${joinCatSql}
      WHERE ${avail}${whereCatSql}${ex}`,
      baseParams,
    );

    let mn = Number(priceRows[0]?.mn);
    let mx = Number(priceRows[0]?.mx);

    /** Для некорректных «пустых» выборок — нули без NaN */
    const priceMinOverall = Number.isFinite(mn) ? mn : 0;
    const priceMaxOverall = Number.isFinite(mx) ? mx : 0;

    const nicRows = await all(
      `
      SELECT DISTINCT ${nk} AS nk
      FROM products p
      ${joinCatSql}
      WHERE ${avail}${whereCatSql}${ex}
        AND ${nk} IS NOT NULL AND ${nk} <> ''
      ORDER BY nk ASC`,
      baseParams,
    );

    const nicotineValues = nicRows
      .map((r) => String(r.nk || '').trim())
      .filter(Boolean);

    const volumeRows = await all(
      `
      SELECT DISTINCT ${vk} AS vk
      FROM products p
      ${joinCatSql}
      WHERE ${avail}${whereCatSql}${ex}
        AND ${vk} IS NOT NULL AND ${vk} <> ''
      ORDER BY vk ASC`,
      baseParams,
    );

    const volumeValues = volumeRows
      .map((r) => String(r.vk || '').trim())
      .filter(Boolean);

    const brandRows = await all(
      `
      SELECT DISTINCT TRIM(COALESCE(p.brand,'')) AS bn FROM products p
      ${joinCatSql}
      WHERE ${avail}${whereCatSql}${ex}
        AND TRIM(COALESCE(p.brand,'')) <> ''
      ORDER BY bn ASC`,
      baseParams,
    );

    const manufacturers = brandRows
      .map((row) => {
        const nm = String(row.bn || '').trim();
        return { name: nm, slug: slugify(nm) };
      })
      .filter((row) => row.name);

    res.json({
      priceMin: priceMinOverall,
      priceMax: priceMaxOverall,
      volumeValues,
      nicotineValues,
      manufacturers,
    });
  } catch (e) {
    console.error('/api/products/filter-meta', e?.stack || e?.message || e);
    next(e);
  }
});

app.get('/api/products', async (req, res, next) => {
  try {
    const parsed = parseCatalogFilters(req.query);
    const avail = productAvailableSQL('p');

    /** Внутри категории + slug строки таблицы `brands` (пилюли брендов). */
    const useBrandJoin = parsed.category && parsed.brandSlugFromTable;

    /** Здесь `producer` уже не смешиваем с slug из brands — пилюля имеет приоритет на JOIN. */
    const extraParsed = useBrandJoin
      ? {
        ...parsed,
        producer:
          parsed.brandSlugFromTable != null ? null : parsed.producer,
      }
      : parsed;

    let { sql: extraSql, params: extraParams } = catalogExtraFiltersSql(
      'p',
      extraParsed,
      {},
    );

    let rows;

    if (parsed.category && parsed.brandSlugFromTable) {
      rows = await all(
        `SELECT p.* FROM products p
         JOIN categories c ON p.category_id=c.id
         JOIN brands b ON b.id=p.brand_id
         WHERE c.slug=? AND b.slug=? AND ${avail}${extraSql}
         ORDER BY p.sort_order, p.name`,
        [parsed.category, parsed.brandSlugFromTable, ...extraParams],
      );
      return res.json(withNormalizedImagesList(rows, req));
    }

    if (parsed.category) {
      rows = await all(
        `SELECT p.* FROM products p
         JOIN categories c ON p.category_id=c.id
         WHERE c.slug=? AND ${avail}${extraSql}
         ORDER BY p.sort_order, p.name`,
        [parsed.category, ...extraParams],
      );
      return res.json(withNormalizedImagesList(rows, req));
    }

    rows = await all(
      `SELECT p.* FROM products p WHERE ${avail}${extraSql} ORDER BY p.sort_order, p.name`,
      extraParams,
    );
    return res.json(withNormalizedImagesList(rows, req));
  } catch (e) {
    console.error('/api/products', e?.stack || e?.message || e);
    next(e);
  }
});

app.post('/api/ai/advise', async (req, res, next) => {
  try {
    const { query, category } = req.body || {};
    const avail = productAvailableSQL('p');
    let sql = `SELECT p.* FROM products p WHERE ${avail}`;
    const params = [];
    if (category) {
      sql += ' AND p.category_id = (SELECT id FROM categories WHERE slug=? LIMIT 1)';
      params.push(String(category));
    }
    sql += ' ORDER BY p.sort_order, p.name LIMIT 120';
    const products = withNormalizedImagesList(await all(sql, params), req);
    const advice = await adviseProducts(String(query || ''), products);
    const byId = new Map(products.map((p) => [Number(p.id), p]));
    const enriched = advice.picks
      .map((pick) => {
        const p = byId.get(Number(pick.id));
        if (!p) return null;
        return { ...p, reason: pick.reason };
      })
      .filter(Boolean);
    res.json({ intro: advice.intro, products: enriched });
  } catch (e) {
    if (e?.code === 'AI_NOT_CONFIGURED') return res.status(503).json({ error: e.message, code: e.code });
    if (e?.code === 'QUERY_TOO_SHORT') return res.status(400).json({ error: e.message, code: e.code });
    if (e?.code === 'NO_PRODUCTS') return res.status(404).json({ error: e.message, code: e.code });
    next(e);
  }
});

app.post('/api/orders', async (req, res, next) => {
  try {
    const { telegram_user_id, telegram_username, telegram_first_name, items, customer_note } = req.body;
    if (!telegram_user_id || !items?.length) return res.status(400).json({ error: 'Missing fields' });

    const userId = String(telegram_user_id);
    const block = await getBlockStatus(userId);
    if (block.blocked) {
      return res.status(403).json({
        error: blockedUserMessage(block.reason),
        code: 'USER_BLOCKED',
      });
    }

    let total = 0;
    const enriched = [];
    for (const item of items) {
      if (!item.product_id || !item.qty || item.qty < 1) {
        return res.status(400).json({ error: 'Invalid cart item' });
      }
      const product = await get('SELECT * FROM products WHERE id=?', [item.product_id]);
      if (!product) return res.status(400).json({ error: `Product ${item.product_id} not found` });
      const sq = product.stock_qty == null || product.stock_qty === undefined ? -1 : Number(product.stock_qty);
      const lineLabel = formatOrderLineName(product);
      if (sq !== -1) {
        if (item.qty > sq) {
          return res.status(400).json({ error: `Недостаточно остатка: ${lineLabel} (доступно ${sq})` });
        }
      } else if (!product.in_stock) {
        return res.status(400).json({ error: `Товар недоступен: ${lineLabel}` });
      }
      total += product.price * item.qty;
      enriched.push({
        ...item,
        name: lineLabel,
        product_name: product.name,
        brand: product.brand || null,
        price: product.price,
      });
    }

    const orderPayload = await withTransaction(async (db) => {
      const reserveItems = enriched.map((it) => ({
        product_id: it.product_id,
        qty: it.qty,
      }));
      const reserved = await reserveStock(db, reserveItems, formatOrderLineName);
      if (!reserved.ok) {
        const err = new Error(reserved.message || 'Недостаточно остатка');
        err.code = reserved.code;
        throw err;
      }

      const result = await db.run(
        'INSERT INTO orders (telegram_user_id,telegram_username,telegram_first_name,items,total,customer_note,stock_reserved) VALUES (?,?,?,?,?,?,1)',
        [userId, telegram_username || null, telegram_first_name || null, JSON.stringify(enriched), total, customer_note || null],
      );
      return { orderId: result.lastInsertRowid };
    });

    const order = await get('SELECT * FROM orders WHERE id=?', [orderPayload.orderId]);
    notifyOwner(OWNER_CHAT_ID, order, enriched);
    notifyCustomer(userId, order.id);

    res.json({ success: true, order_id: order.id, total });
  } catch (e) {
    if (e?.code === 'INSUFFICIENT_STOCK' || e?.code === 'UNAVAILABLE') {
      return res.status(400).json({ error: e.message, code: e.code });
    }
    next(e);
  }
});

app.get('/api/orders/user/:telegramId', async (req, res, next) => {
  try {
    const orders = await all('SELECT * FROM orders WHERE telegram_user_id=? ORDER BY created_at DESC', [req.params.telegramId]);
    res.json(orders.map(o => ({ ...o, items: JSON.parse(o.items) })));
  } catch (e) { next(e); }
});

/** Повтор заказа: актуальные цены и остатки по позициям. */
app.post('/api/orders/:id/repeat', async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const userId = String(req.body?.telegram_user_id ?? '').trim();
    if (!userId || !Number.isFinite(orderId)) {
      return res.status(400).json({ error: 'Missing telegram_user_id or order id' });
    }

    const block = await getBlockStatus(userId);
    if (block.blocked) {
      return res.status(403).json({ error: blockedUserMessage(block.reason), code: 'USER_BLOCKED' });
    }

    const order = await get(
      'SELECT * FROM orders WHERE id=? AND telegram_user_id=?',
      [orderId, userId],
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const rawItems = JSON.parse(order.items || '[]');
    const items = [];
    for (const line of rawItems) {
      const pid = Number(line.product_id);
      const qty = Math.max(1, Number(line.qty) || 1);
      if (!Number.isFinite(pid)) continue;

      const product = await get('SELECT * FROM products WHERE id=?', [pid]);
      if (!product) {
        items.push({
          product_id: pid,
          qty,
          available: false,
          reason: 'Товар больше не в каталоге',
          name: line.name || line.product_name || `Товар #${pid}`,
        });
        continue;
      }

      const sq = product.stock_qty == null || product.stock_qty === undefined
        ? -1
        : Number(product.stock_qty);
      const label = formatOrderLineName(product);
      let available = true;
      let reason = null;
      let finalQty = qty;

      if (sq === -1) {
        if (!product.in_stock) {
          available = false;
          reason = 'Нет в наличии';
        }
      } else if (sq <= 0) {
        available = false;
        reason = 'Нет в наличии';
      } else if (qty > sq) {
        finalQty = sq;
        reason = `Доступно только ${sq} шт.`;
      }

      items.push({
        product_id: pid,
        qty: finalQty,
        available,
        reason,
        name: label,
        brand: product.brand || null,
        price: Number(product.price),
        stock_qty: product.stock_qty,
        image_url: product.image_url,
      });
    }

    const availableItems = items.filter((i) => i.available);
    res.json({
      order_id: orderId,
      items,
      available_count: availableItems.length,
      skipped_count: items.length - availableItems.length,
    });
  } catch (e) { next(e); }
});

app.get('/api/favorites/user/:telegramId', async (req, res, next) => {
  try {
    const userId = String(req.params.telegramId || '').trim();
    if (!userId) return res.status(400).json({ error: 'Missing user id' });

    const rows = await all(
      `SELECT p.* FROM favorites f
       JOIN products p ON p.id = f.product_id
       WHERE f.telegram_user_id = ?
       ORDER BY f.created_at DESC`,
      [userId],
    );
    const avail = productAvailableSQL('p');
    const available = await all(
      `SELECT p.* FROM favorites f
       JOIN products p ON p.id = f.product_id
       WHERE f.telegram_user_id = ? AND ${avail}
       ORDER BY f.created_at DESC`,
      [userId],
    );

    res.json({
      product_ids: rows.map((r) => Number(r.id)),
      products: withNormalizedImagesList(available, req),
      total: rows.length,
    });
  } catch (e) { next(e); }
});

app.post('/api/favorites/toggle', async (req, res, next) => {
  try {
    const userId = String(req.body?.telegram_user_id ?? '').trim();
    const productId = Number(req.body?.product_id);
    if (!userId || !Number.isFinite(productId)) {
      return res.status(400).json({ error: 'Missing telegram_user_id or product_id' });
    }

    const product = await get('SELECT id FROM products WHERE id=?', [productId]);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const existing = await get(
      'SELECT id FROM favorites WHERE telegram_user_id=? AND product_id=?',
      [userId, productId],
    );

    if (existing) {
      await run('DELETE FROM favorites WHERE telegram_user_id=? AND product_id=?', [userId, productId]);
      return res.json({ favorited: false, product_id: productId });
    }

    await run(
      'INSERT INTO favorites (telegram_user_id, product_id) VALUES (?,?)',
      [userId, productId],
    );
    res.json({ favorited: true, product_id: productId });
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
    const nextOwner = owner_note !== undefined ? owner_note : cur.owner_note;
    const nextCust = customer_note !== undefined ? customer_note : cur.customer_note;

    const prevStatus = String(cur.status || '');

    if (status != null && String(status) !== prevStatus) {
      const trans = await transitionOrderStatus(id, String(status));
      if (!trans.ok) {
        if (trans.code === 'INSUFFICIENT_STOCK') {
          return res.status(400).json({ error: trans.message || 'Недостаточно остатков', code: trans.code });
        }
        if (trans.code === 'NOT_FOUND') return res.status(404).json({ error: 'Not found' });
        return res.status(400).json({ error: trans.message || trans.code || 'Нельзя изменить статус' });
      }
    }

    await run(
      'UPDATE orders SET owner_note=?, customer_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [nextOwner || null, nextCust || null, id]
    );
    const o = await get('SELECT * FROM orders WHERE id=?', [id]);

    const newStatusStr = String(o.status || '');
    if (cur.telegram_user_id && prevStatus !== newStatusStr) {
      notifyCustomerOrderStatus(cur.telegram_user_id, id, newStatusStr);
    }
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
    const deleted = await run('DELETE FROM products WHERE brand_id=?', [id]);
    await run('DELETE FROM brands WHERE id=?', [id]);
    res.json({ ok: true, deletedProducts: deleted.changes ?? 0 });
  } catch (e) { next(e); }
});

app.delete('/api/admin/categories/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const deleted = await run('DELETE FROM products WHERE category_id=?', [id]);
    await run('DELETE FROM brands WHERE category_id=?', [id]);
    await run('DELETE FROM categories WHERE id=?', [id]);
    res.json({ ok: true, deletedProducts: deleted.changes ?? 0 });
  } catch (e) { next(e); }
});

app.get('/api/admin/blocked-users', requireAdmin, async (_req, res, next) => {
  try {
    const rows = await all('SELECT * FROM blocked_users ORDER BY blocked_at DESC');
    res.json(rows);
  } catch (e) { next(e); }
});

app.get('/api/admin/order-customers', requireAdmin, async (_req, res, next) => {
  try {
    const rows = await all(`
      SELECT
        telegram_user_id,
        MAX(telegram_first_name) AS telegram_first_name,
        MAX(telegram_username) AS telegram_username,
        COUNT(*) AS order_count,
        MAX(created_at) AS last_order_at
      FROM orders
      GROUP BY telegram_user_id
      ORDER BY last_order_at DESC
      LIMIT 200
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

app.post('/api/admin/blocked-users', requireAdmin, async (req, res, next) => {
  try {
    const { telegram_user_id, reason, blocked_by } = req.body || {};
    const uid = String(telegram_user_id ?? '').trim();
    if (!uid) return res.status(400).json({ error: 'Укажите telegram_user_id' });
    await run(
      `INSERT INTO blocked_users (telegram_user_id, reason, blocked_by)
       VALUES (?,?,?)
       ON CONFLICT(telegram_user_id) DO UPDATE SET
         reason=excluded.reason,
         blocked_by=excluded.blocked_by,
         blocked_at=CURRENT_TIMESTAMP`,
      [uid, reason ? String(reason).trim() : null, blocked_by ? String(blocked_by).trim() : 'admin'],
    );
    const row = await get('SELECT * FROM blocked_users WHERE telegram_user_id=?', [uid]);
    res.json(row);
  } catch (e) { next(e); }
});

app.delete('/api/admin/blocked-users/:telegramUserId', requireAdmin, async (req, res, next) => {
  try {
    const uid = String(req.params.telegramUserId ?? '').trim();
    if (!uid) return res.status(400).json({ error: 'Некорректный id' });
    const result = await run('DELETE FROM blocked_users WHERE telegram_user_id=?', [uid]);
    if (!result.changes) {
      return res.status(404).json({ error: 'Пользователь не найден в списке блокировок' });
    }
    res.json({ ok: true, telegram_user_id: uid });
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
