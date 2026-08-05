/**
 * Единый слой данных:
 * - DATABASE_URL задан → PostgreSQL (Render и др.)
 * - иначе → SQLite через sql.js (локальная разработка).
 * Все запросы через async API: await all(...) / await get(...) / await run(...)
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'shop.db');
const DATABASE_URL = (process.env.DATABASE_URL || '').trim();

export let dialect = DATABASE_URL ? 'pg' : 'sqlite';

/** @type {import('sql.js').Database | null} */
let sqliteDb = null;
/** @type {pg.Pool | null} */
let pool = null;
/** Не писать shop.db на диск между BEGIN и COMMIT */
let sqliteInTransaction = false;

function sqlPlaceholderToPg(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

/** Нормализация строки из Postgres (bigint, numeric) под ожидания приложения */
function normalizePgRow(row) {
  if (!row) return row;
  const o = { ...row };
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'bigint') o[k] = Number(v);
  }
  const numKeys = [
    'id', 'category_id', 'brand_id', 'price', 'old_price', 'in_stock', 'sort_order', 'stock_qty', 'total',
    'subtotal', 'discount_total', 'level_discount_percent', 'coupon_id', 'value', 'uses_total', 'active',
    'qualified', 'orders_count',
  ];
  for (const k of numKeys) {
    if (!(k in o) || o[k] === null || o[k] === undefined) continue;
    if (typeof o[k] === 'string' && o[k].trim() !== '') {
      const n = Number(o[k]);
      if (Number.isFinite(n)) o[k] = n;
    }
  }
  return o;
}

export function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s_-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'item';
}

// ——— Postgres ———

async function pgAll(sql, params = []) {
  const r = await pool.query(sqlPlaceholderToPg(sql), params);
  return r.rows.map(normalizePgRow);
}

async function pgGet(sql, params = []) {
  const rows = await pgAll(sql, params);
  return rows[0] || null;
}

async function pgRun(sql, params = []) {
  const trimmed = sql.trim();
  const isInsert = /^INSERT\s+/i.test(trimmed);
  let text = sqlPlaceholderToPg(sql);
  if (isInsert && !/RETURNING\b/i.test(text)) text = `${text.trim().replace(/;+$/, '')} RETURNING id`;
  const r = await pool.query(text, params);
  if (isInsert && r.rows[0]?.id != null) {
    return { lastInsertRowid: Number(r.rows[0].id), changes: r.rowCount ?? 0 };
  }
  return { lastInsertRowid: 0, changes: r.rowCount ?? 0 };
}

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  emoji TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS brands (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(category_id, slug)
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  brand TEXT,
  description TEXT,
  price DOUBLE PRECISION NOT NULL,
  old_price DOUBLE PRECISION,
  volume TEXT,
  nicotine TEXT,
  in_stock INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  image_url TEXT,
  stock_qty INTEGER DEFAULT -1
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  telegram_username TEXT,
  telegram_first_name TEXT,
  items TEXT NOT NULL,
  total DOUBLE PRECISION NOT NULL,
  status TEXT DEFAULT 'new',
  customer_note TEXT,
  owner_note TEXT,
  stock_reserved INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blocked_users (
  id SERIAL PRIMARY KEY,
  telegram_user_id TEXT UNIQUE NOT NULL,
  reason TEXT,
  blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  blocked_by TEXT
);

CREATE TABLE IF NOT EXISTS favorites (
  id SERIAL PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(telegram_user_id, product_id)
);

CREATE TABLE IF NOT EXISTS user_wallets (
  telegram_user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coin_transactions (
  id SERIAL PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  order_id INTEGER,
  meta TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referrals (
  referred_user_id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL,
  qualified INTEGER DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  qualified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  type TEXT NOT NULL,
  value DOUBLE PRECISION DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  uses_total INTEGER DEFAULT 1,
  expires_at TIMESTAMP,
  active INTEGER DEFAULT 1,
  source TEXT DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupon_uses (
  id SERIAL PRIMARY KEY,
  coupon_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  order_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

function pgPoolConfig() {
  const connectionString = DATABASE_URL;
  const isLocal =
    /^postgres(ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1)[:\/]/i.test(connectionString);
  const disableSsl =
    process.env.DATABASE_SSL === 'false' || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0';
  if (isLocal || disableSsl) return { connectionString };
  return {
    connectionString,
    ssl: { rejectUnauthorized: false },
  };
}

/** Из поля products.brand заполняет brands и связывает brand_id — нужно для фильтра каталога по бренду. */
async function syncPgBrandsFromProductNames() {
  const { rows } = await pool.query(`
    SELECT DISTINCT category_id, brand FROM products
    WHERE brand IS NOT NULL AND trim(brand) <> ''
  `);
  for (const row of rows) {
    const sl = slugify(row.brand);
    await pool.query(
      `INSERT INTO brands (category_id, name, slug, sort_order)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (category_id, slug) DO NOTHING`,
      [row.category_id, row.brand, sl],
    );
  }
  await pool.query(`
    UPDATE products p
    SET brand_id = b.id
    FROM brands b
    WHERE b.category_id = p.category_id
      AND trim(b.name) = trim(coalesce(p.brand, ''))
      AND p.brand IS NOT NULL AND trim(p.brand) <> ''
      AND p.brand_id IS NULL
  `);
}

async function initPostgres() {
  pool = new pg.Pool(pgPoolConfig());
  await pool.query(PG_SCHEMA);
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved INTEGER DEFAULT 0
  `).catch(() => {});
  await pool.query(`
    INSERT INTO categories (name, slug, emoji, description, sort_order, image_url)
    SELECT 'Картриджи', 'cartridges', '💨',
           'Раздел как у жидкостей: сначала бренд или навигация по каталогу категории.', 100, NULL
    WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'cartridges')
  `);
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_qty INTEGER DEFAULT -1
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE brands ADD COLUMN IF NOT EXISTS image_url TEXT
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS coins_awarded INTEGER DEFAULT 0
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal DOUBLE PRECISION
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_total DOUBLE PRECISION DEFAULT 0
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS level_discount_percent DOUBLE PRECISION DEFAULT 0
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id INTEGER
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_title TEXT
  `).catch(() => {});
  await syncPgBrandsFromProductNames();
  console.log('✅ PostgreSQL: схема готова (категории и товары только через админку)');
}

// ——— SQLite (sql.js) ———


function sqliteAll(sql, params = []) {
  const stmt = sqliteDb.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function sqliteGet(sql, params = []) {
  return sqliteAll(sql, params)[0] || null;
}

function persistSqlite() {
  if (!sqliteDb) return;
  const data = sqliteDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function sqliteRun(sql, params = []) {
  sqliteDb.run(sql, params);
  const changes = sqliteDb.getRowsModified();
  const res = sqliteDb.exec('SELECT last_insert_rowid()');
  const lastInsertRowid = res[0]?.values[0][0];
  if (!sqliteInTransaction) {
    persistSqlite();
  }
  return { lastInsertRowid, changes };
}

function hasColumnSQLite(table, column) {
  const cols = sqliteAll(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
}

async function initSqlite() {
  const SQL = await initSqlJs();
  const dbBuffer = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  sqliteDb = new SQL.Database(dbBuffer);

  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
      emoji TEXT NOT NULL, description TEXT, sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL, name TEXT NOT NULL,
      brand TEXT, description TEXT, price REAL NOT NULL,
      old_price REAL, volume TEXT, nicotine TEXT,
      in_stock INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_user_id TEXT NOT NULL, telegram_username TEXT,
      telegram_first_name TEXT, items TEXT NOT NULL,
      total REAL NOT NULL, status TEXT DEFAULT 'new',
      customer_note TEXT, owner_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    if (!hasColumnSQLite('categories', 'image_url')) {
      sqliteDb.run('ALTER TABLE categories ADD COLUMN image_url TEXT');
    }
    if (!hasColumnSQLite('products', 'image_url')) {
      sqliteDb.run('ALTER TABLE products ADD COLUMN image_url TEXT');
    }
    if (!hasColumnSQLite('products', 'brand_id')) {
      sqliteDb.run('ALTER TABLE products ADD COLUMN brand_id INTEGER');
    }

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS brands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        image_url TEXT,
        sort_order INTEGER DEFAULT 0,
        UNIQUE(category_id, slug)
      );
    `);

    const legacyBrands = sqliteAll(`
      SELECT category_id, brand
      FROM products
      WHERE brand IS NOT NULL AND TRIM(brand) <> ''
      GROUP BY category_id, brand
      ORDER BY category_id, brand
    `);

    for (const row of legacyBrands) {
      const slug = slugify(row.brand);
      sqliteDb.run(
        'INSERT OR IGNORE INTO brands (category_id, name, slug, sort_order) VALUES (?,?,?,0)',
        [row.category_id, row.brand, slug],
      );
    }

    const productsToUpdate = sqliteAll(`
      SELECT p.id, p.category_id, p.brand, b.id as bid
      FROM products p
      JOIN brands b ON b.category_id = p.category_id AND b.name = p.brand
      WHERE (p.brand_id IS NULL OR p.brand_id = '') AND p.brand IS NOT NULL AND TRIM(p.brand) <> ''
    `);
    for (const pr of productsToUpdate) {
      sqliteDb.run('UPDATE products SET brand_id = ? WHERE id = ?', [pr.bid, pr.id]);
    }

    if (!hasColumnSQLite('products', 'stock_qty')) {
      sqliteDb.run('ALTER TABLE products ADD COLUMN stock_qty INTEGER DEFAULT -1');
      sqliteDb.run('UPDATE products SET stock_qty = CASE WHEN in_stock=0 THEN 0 ELSE -1 END');
    }

    if (!hasColumnSQLite('orders', 'stock_reserved')) {
      sqliteDb.run('ALTER TABLE orders ADD COLUMN stock_reserved INTEGER DEFAULT 0');
    }

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS blocked_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id TEXT UNIQUE NOT NULL,
        reason TEXT,
        blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        blocked_by TEXT
      );
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id TEXT NOT NULL,
        product_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(telegram_user_id, product_id)
      );
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS user_wallets (
        telegram_user_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS coin_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id TEXT NOT NULL,
        delta INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reason TEXT NOT NULL,
        order_id INTEGER,
        meta TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    if (!hasColumnSQLite('orders', 'coins_awarded')) {
      sqliteDb.run('ALTER TABLE orders ADD COLUMN coins_awarded INTEGER DEFAULT 0');
    }

    if (!hasColumnSQLite('orders', 'subtotal')) {
      sqliteDb.run('ALTER TABLE orders ADD COLUMN subtotal REAL');
    }
    if (!hasColumnSQLite('orders', 'discount_total')) {
      sqliteDb.run('ALTER TABLE orders ADD COLUMN discount_total REAL DEFAULT 0');
    }
    if (!hasColumnSQLite('orders', 'level_discount_percent')) {
      sqliteDb.run('ALTER TABLE orders ADD COLUMN level_discount_percent REAL DEFAULT 0');
    }
    if (!hasColumnSQLite('orders', 'coupon_id')) {
      sqliteDb.run('ALTER TABLE orders ADD COLUMN coupon_id INTEGER');
    }
    if (!hasColumnSQLite('orders', 'coupon_title')) {
      sqliteDb.run('ALTER TABLE orders ADD COLUMN coupon_title TEXT');
    }

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS referrals (
        referred_user_id TEXT PRIMARY KEY,
        referrer_user_id TEXT NOT NULL,
        qualified INTEGER DEFAULT 0,
        orders_count INTEGER DEFAULT 0,
        qualified_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        type TEXT NOT NULL,
        value REAL DEFAULT 0,
        title TEXT NOT NULL,
        description TEXT,
        uses_total INTEGER DEFAULT 1,
        expires_at DATETIME,
        active INTEGER DEFAULT 1,
        source TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS coupon_uses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coupon_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        order_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    sqliteDb.run(`
      INSERT OR IGNORE INTO categories (name, slug, emoji, description, sort_order)
      VALUES ('Картриджи', 'cartridges', '💨',
              'Раздел как у жидкостей: сначала бренд или навигация по каталогу категории.', 100)
    `);

    const data = sqliteDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    console.log('⚠️  DB migration warning:', e?.message || e);
  }

  console.log('✅ SQLite: таблицы готовы (категории и товары только через админку)');
}

/** Вызови один раз до app.listen и initBot после этого */
export async function initDb() {
  dialect = DATABASE_URL ? 'pg' : 'sqlite';
  if (dialect === 'pg') {
    await initPostgres();
    console.log('✅ PostgreSQL подключена');
    return;
  }
  await initSqlite();
  console.log('✅ SQLite (sql.js):', DB_PATH);
}

export async function all(sql, params) {
  return dialect === 'pg' ? pgAll(sql, params) : Promise.resolve(sqliteAll(sql, params || []));
}

export async function get(sql, params) {
  return dialect === 'pg' ? pgGet(sql, params) : Promise.resolve(sqliteGet(sql, params || []));
}

export async function run(sql, params) {
  return dialect === 'pg' ? pgRun(sql, params) : Promise.resolve(sqliteRun(sql, params || []));
}

/**
 * Транзакция: fn получает тот же API { all, get, run }.
 * @template T
 * @param {(db: { all: typeof all, get: typeof get, run: typeof run }) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
  if (dialect === 'pg') {
    const client = await pool.connect();
    const txAll = async (sql, params = []) => {
      const r = await client.query(sqlPlaceholderToPg(sql), params);
      return r.rows.map(normalizePgRow);
    };
    const txGet = async (sql, params = []) => {
      const rows = await txAll(sql, params);
      return rows[0] || null;
    };
    const txRun = async (sql, params = []) => {
      const trimmed = sql.trim();
      const isInsert = /^INSERT\s+/i.test(trimmed);
      let text = sqlPlaceholderToPg(sql);
      if (isInsert && !/RETURNING\b/i.test(text)) {
        text = `${text.trim().replace(/;+$/, '')} RETURNING id`;
      }
      const r = await client.query(text, params);
      if (isInsert && r.rows[0]?.id != null) {
        return { lastInsertRowid: Number(r.rows[0].id), changes: r.rowCount ?? 0 };
      }
      return { lastInsertRowid: 0, changes: r.rowCount ?? 0 };
    };
    const db = { all: txAll, get: txGet, run: txRun };
    try {
      await client.query('BEGIN');
      const result = await fn(db);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  sqliteInTransaction = true;
  sqliteDb.run('BEGIN');
  const db = {
    all: (sql, params) => Promise.resolve(sqliteAll(sql, params || [])),
    get: (sql, params) => Promise.resolve(sqliteGet(sql, params || [])),
    run: (sql, params) => Promise.resolve(sqliteRun(sql, params || [])),
  };
  try {
    const result = await fn(db);
    sqliteDb.run('COMMIT');
    persistSqlite();
    return result;
  } catch (e) {
    sqliteDb.run('ROLLBACK');
    persistSqlite();
    throw e;
  } finally {
    sqliteInTransaction = false;
  }
}

/** После массового импорта на Postgres связать brand_id с полем brand (та же логика, что при старте БД). */
export async function syncBrandsAfterBulkImport() {
  if (dialect !== 'pg' || !pool) return;
  await syncPgBrandsFromProductNames();
}
