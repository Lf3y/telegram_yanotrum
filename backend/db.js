import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'shop.db');

const SQL = await initSqlJs();
let dbBuffer = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
const db = new SQL.Database(dbBuffer);

function save() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

db.run(`
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

function hasColumn(table, column) {
  const cols = all(`PRAGMA table_info(${table})`);
  return cols.some(c => c.name === column);
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

// Migrations (safe on existing DB)
try {
  if (!hasColumn('categories', 'image_url')) {
    db.run(`ALTER TABLE categories ADD COLUMN image_url TEXT`);
  }
  if (!hasColumn('products', 'image_url')) {
    db.run(`ALTER TABLE products ADD COLUMN image_url TEXT`);
  }
  if (!hasColumn('products', 'brand_id')) {
    db.run(`ALTER TABLE products ADD COLUMN brand_id INTEGER`);
  }

  db.run(`
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

  // Backfill brands from existing products.brand (if any)
  const legacyBrands = all(`
    SELECT category_id, brand
    FROM products
    WHERE brand IS NOT NULL AND TRIM(brand) <> ''
    GROUP BY category_id, brand
    ORDER BY category_id, brand
  `);

  for (const row of legacyBrands) {
    const slug = slugify(row.brand);
    // INSERT OR IGNORE (sqlite supports it)
    db.run(
      `INSERT OR IGNORE INTO brands (category_id, name, slug, sort_order) VALUES (?,?,?,0)`,
      [row.category_id, row.brand, slug]
    );
  }

  // Backfill products.brand_id based on (category_id + brand)
  const productsToUpdate = all(`
    SELECT p.id, p.category_id, p.brand, b.id as bid
    FROM products p
    JOIN brands b ON b.category_id = p.category_id AND b.name = p.brand
    WHERE (p.brand_id IS NULL OR p.brand_id = '') AND p.brand IS NOT NULL AND TRIM(p.brand) <> ''
  `);
  for (const p of productsToUpdate) {
    db.run(`UPDATE products SET brand_id = ? WHERE id = ?`, [p.bid, p.id]);
  }

  // Остатки: -1 = безлимит (не ведём учёт), 0 = нет в наличии, >0 = штук на складе
  if (!hasColumn('products', 'stock_qty')) {
    db.run(`ALTER TABLE products ADD COLUMN stock_qty INTEGER DEFAULT -1`);
    db.run(`UPDATE products SET stock_qty = CASE WHEN in_stock=0 THEN 0 ELSE -1 END`);
  }

  save();
} catch (e) {
  console.log('⚠️  DB migration warning:', e?.message || e);
}

export function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

export function run(sql, params = []) {
  db.run(sql, params);
  save();
  const res = db.exec('SELECT last_insert_rowid()');
  return { lastInsertRowid: res[0]?.values[0][0] };
}

// Seed
const catCount = get('SELECT COUNT(*) as c FROM categories');
if (!catCount || catCount.c === 0) {
  const cats = [
    ['Жидкости','liquids','💧','Жидкости для под-систем и дриперов',1],
    ['Одноразки','disposable','⚡','Одноразовые электронные сигареты',2],
    ['Солевой никотин','salts','🧪','Солевые жидкости для под-систем',3],
    ['Аксессуары','accessories','🔧','Картриджи, испарители, аккумуляторы',4],
  ];
  cats.forEach(c => db.run('INSERT INTO categories (name,slug,emoji,description,sort_order) VALUES (?,?,?,?,?)',c));
  const prods = [
    [1,'Mango Ice','BLVK','Сочный манго со льдом',650,800,'60ml','3мг'],
    [1,'Strawberry Milk','Nasty Juice','Клубника со сливками',720,null,'60ml','3мг'],
    [1,'Blue Razz Lemonade','Twist','Голубая малина и лимонад',680,750,'60ml','6мг'],
    [1,'Watermelon Chill','Dinner Lady','Арбуз с прохладой',750,null,'60ml','3мг'],
    [2,'Elf Bar BC5000','Elf Bar','До 5000 затяжек, заряжаемая',1200,1400,'13ml','50мг'],
    [2,'Lost Mary BM5000','Lost Mary','Mesh испаритель, яркий вкус',1350,null,'13ml','50мг'],
    [2,'HQD Cuvie Bar','HQD','До 7000 затяжек',1100,1250,'18ml','50мг'],
    [2,'Vozol Star 9000','Vozol','Большой объём, долгий ресурс',1500,null,'20ml','50мг'],
    [3,'Pod Salt Go Mango','Pod Salt','Солевой никотин манго',550,null,'30ml','20мг'],
    [3,'Brusko Salt Mint','Brusko','Свежая мята',480,550,'30ml','20мг'],
    [3,'Naked 100 Salt','Naked 100','Тропический микс',600,null,'30ml','35мг'],
    [4,'Картридж SMOK Nord 4','SMOK','Оригинальный картридж',350,null,null,null],
    [4,'Испаритель Vaporesso GTX','Vaporesso','0.3 Ом mesh',280,320,null,null],
    [4,'Аккумулятор 18650 Samsung','Samsung','3000mAh, 20A',450,null,null,null],
  ];
  prods.forEach(p => db.run('INSERT INTO products (category_id,name,brand,description,price,old_price,volume,nicotine,in_stock) VALUES (?,?,?,?,?,?,?,?,1)',p));
  save();
  console.log('✅ DB seeded with sample data');
}

export default db;
