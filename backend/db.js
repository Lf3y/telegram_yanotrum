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
  const numKeys = ['id', 'category_id', 'brand_id', 'price', 'old_price', 'in_stock', 'sort_order', 'stock_qty', 'total'];
  for (const k of numKeys) {
    if (!(k in o) || o[k] === null || o[k] === undefined) continue;
    if (typeof o[k] === 'string' && o[k].trim() !== '') {
      const n = Number(o[k]);
      if (Number.isFinite(n)) o[k] = n;
    }
  }
  return o;
}

function slugify(input) {
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
    return { lastInsertRowid: Number(r.rows[0].id) };
  }
  return { lastInsertRowid: 0 };
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

  const { rows: [{ c }] } = await pool.query('SELECT COUNT(*)::int AS c FROM categories');
  if (Number(c) === 0) {
  const cats = [
    ['Жидкости', 'liquids', '💧', 'Жидкости для под-систем и дриперов', 1],
    ['Одноразки', 'disposable', '⚡', 'Одноразовые электронные сигареты', 2],
    ['Солевой никотин', 'salts', '🧪', 'Солевые жидкости для под-систем', 3],
    ['Аксессуары', 'accessories', '🔧', 'Картриджи, испарители, аккумуляторы', 4],
  ];
  for (const c of cats) {
    await pool.query(
      'INSERT INTO categories (name,slug,emoji,description,sort_order) VALUES ($1,$2,$3,$4,$5)',
      c,
    );
  }

  const prods = [
    [1, 'Mango Ice', 'BLVK', 'Сочный манго со льдом', 650, 800, '60ml', '3мг'],
    [1, 'Strawberry Milk', 'Nasty Juice', 'Клубника со сливками', 720, null, '60ml', '3мг'],
    [1, 'Blue Razz Lemonade', 'Twist', 'Голубая малина и лимонад', 680, 750, '60ml', '6мг'],
    [1, 'Watermelon Chill', 'Dinner Lady', 'Арбуз с прохладой', 750, null, '60ml', '3мг'],
    [2, 'Elf Bar BC5000', 'Elf Bar', 'До 5000 затяжек, заряжаемая', 1200, 1400, '13ml', '50мг'],
    [2, 'Lost Mary BM5000', 'Lost Mary', 'Mesh испаритель, яркий вкус', 1350, null, '13ml', '50мг'],
    [2, 'HQD Cuvie Bar', 'HQD', 'До 7000 затяжек', 1100, 1250, '18ml', '50мг'],
    [2, 'Vozol Star 9000', 'Vozol', 'Большой объём, долгий ресурс', 1500, null, '20ml', '50мг'],
    [3, 'Pod Salt Go Mango', 'Pod Salt', 'Солевой никотин манго', 550, null, '30ml', '20мг'],
    [3, 'Brusko Salt Mint', 'Brusko', 'Свежая мята', 480, 550, '30ml', '20мг'],
    [3, 'Naked 100 Salt', 'Naked 100', 'Тропический микс', 600, null, '30ml', '35мг'],
    [4, 'Картридж SMOK Nord 4', 'SMOK', 'Оригинальный картридж', 350, null, null, null],
    [4, 'Испаритель Vaporesso GTX', 'Vaporesso', '0.3 Ом mesh', 280, 320, null, null],
    [4, 'Аккумулятор 18650 Samsung', 'Samsung', '3000mAh, 20A', 450, null, null, null],
  ];
  for (const p of prods) {
    await pool.query(
      `INSERT INTO products (category_id,name,brand,description,price,old_price,volume,nicotine,in_stock)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)`,
      p,
    );
  }

  console.log('✅ PostgreSQL: добавлен demo seed');
  } else {
    console.log('✅ PostgreSQL: категории уже есть — seed пропущен');
  }

  await syncPgBrandsFromProductNames();
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

function sqliteRun(sql, params = []) {
  sqliteDb.run(sql, params);
  const data = sqliteDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  const res = sqliteDb.exec('SELECT last_insert_rowid()');
  return { lastInsertRowid: res[0]?.values[0][0] };
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

    const data = sqliteDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    console.log('⚠️  DB migration warning:', e?.message || e);
  }

  const catCount = sqliteGet('SELECT COUNT(*) as c FROM categories');
  if (!catCount || catCount.c === 0) {
    const cats = [
      ['Жидкости', 'liquids', '💧', 'Жидкости для под-систем и дриперов', 1],
      ['Одноразки', 'disposable', '⚡', 'Одноразовые электронные сигареты', 2],
      ['Солевой никотин', 'salts', '🧪', 'Солевые жидкости для под-систем', 3],
      ['Аксессуары', 'accessories', '🔧', 'Картриджи, испарители, аккумуляторы', 4],
    ];
    cats.forEach(c =>
      sqliteDb.run('INSERT INTO categories (name,slug,emoji,description,sort_order) VALUES (?,?,?,?,?)', c),
    );
    const prods = [
      [1, 'Mango Ice', 'BLVK', 'Сочный манго со льдом', 650, 800, '60ml', '3мг'],
      [1, 'Strawberry Milk', 'Nasty Juice', 'Клубника со сливками', 720, null, '60ml', '3мг'],
      [1, 'Blue Razz Lemonade', 'Twist', 'Голубая малина и лимонад', 680, 750, '60ml', '6мг'],
      [1, 'Watermelon Chill', 'Dinner Lady', 'Арбуз с прохладой', 750, null, '60ml', '3мг'],
      [2, 'Elf Bar BC5000', 'Elf Bar', 'До 5000 затяжек, заряжаемая', 1200, 1400, '13ml', '50мг'],
      [2, 'Lost Mary BM5000', 'Lost Mary', 'Mesh испаритель, яркий вкус', 1350, null, '13ml', '50мг'],
      [2, 'HQD Cuvie Bar', 'HQD', 'До 7000 затяжек', 1100, 1250, '18ml', '50мг'],
      [2, 'Vozol Star 9000', 'Vozol', 'Большой объём, долгий ресурс', 1500, null, '20ml', '50мг'],
      [3, 'Pod Salt Go Mango', 'Pod Salt', 'Солевой никотин манго', 550, null, '30ml', '20мг'],
      [3, 'Brusko Salt Mint', 'Brusko', 'Свежая мята', 480, 550, '30ml', '20мг'],
      [3, 'Naked 100 Salt', 'Naked 100', 'Тропический микс', 600, null, '30ml', '35мг'],
      [4, 'Картридж SMOK Nord 4', 'SMOK', 'Оригинальный картридж', 350, null, null, null],
      [4, 'Испаритель Vaporesso GTX', 'Vaporesso', '0.3 Ом mesh', 280, 320, null, null],
      [4, 'Аккумулятор 18650 Samsung', 'Samsung', '3000mAh, 20A', 450, null, null, null],
    ];
    prods.forEach(p =>
      sqliteDb.run(
        'INSERT INTO products (category_id,name,brand,description,price,old_price,volume,nicotine,in_stock) VALUES (?,?,?,?,?,?,?,?,1)',
        p,
      ),
    );
    fs.writeFileSync(DB_PATH, Buffer.from(sqliteDb.export()));
    console.log('✅ SQLite: добавлен demo seed');
  }
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
