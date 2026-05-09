import * as XLSX from 'xlsx';
import { slugify, get, run, syncBrandsAfterBulkImport } from './db.js';

/** Алиасы заголовков колонок (README — эталонная таблица для Excel). */
const HEADER_ALIASES = {
  category: ['категория', 'category', 'раздел', 'тип', 'вид'],
  brand: ['бренд', 'brand', 'производитель', 'фирма', 'марка'],
  name: ['название', 'name', 'товар', 'наименование', 'модель'],
  price: ['цена', 'price', 'цена_byn', 'byn', 'стоимость', 'розница'],
  old_price: ['старая цена', 'old_price', 'old', 'зачеркнутая'],
  volume: ['объём', 'объем', 'volume', 'мл', 'capacity'],
  nicotine: ['никотин', 'nicotine', 'крепость', 'мг', 'mg'],
  stock_qty: ['остаток', 'stock', 'stock_qty', 'количество', 'кол-во', 'qty', 'шт'],
  in_stock: ['в наличии', 'in_stock', 'доступен'],
  description: ['описание', 'description', 'примечание', 'комментарий'],
  sort_order: ['сортировка', 'sort', 'sort_order', 'порядок', 'порядок товара'],
  image_url: ['фото', 'image', 'image_url', 'картинка', 'ссылка', 'url фото'],
  category_emoji: ['emoji категории', 'category_emoji', 'иконка категории', 'эмодзи категории'],
  category_description: ['описание категории', 'category_description'],
  category_sort: ['порядок категории', 'category_sort', 'sort категории', 'sort_category'],
};

function normHead(s) {
  return String(s ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();
}

function buildAliasToFieldMap() {
  const m = new Map();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    m.set(normHead(field), field);
    for (const a of aliases) m.set(normHead(a), field);
  }
  return m;
}

const ALIAS_TO_FIELD = buildAliasToFieldMap();

function detectFieldMap(sampleRow) {
  const fm = {};
  if (!sampleRow || typeof sampleRow !== 'object') return fm;
  for (const key of Object.keys(sampleRow)) {
    const f = ALIAS_TO_FIELD.get(normHead(key));
    if (f) fm[f] = key;
  }
  return fm;
}

function sheetRowsFromBuffer(buffer, originalname) {
  const wb = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    raw: false,
    codepage: 65001,
  });
  if (!wb.SheetNames?.length) return [];
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  return Array.isArray(rows) ? rows : [];
}

function parseNumberPrice(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).replace(/\s/g, '').replace(',', '.');
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseStockQty(v) {
  if (v == null || v === '') return -1;
  const s = String(v).replace(/\s/g, '').replace(',', '.');
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : -1;
}

function parseInStock(v, stockQty) {
  if (v == null || v === '') return stockQty === 0 ? 0 : 1;
  const s = String(v).trim().toLowerCase();
  if (['1', 'да', 'yes', 'true', '+', 'есть', 'ok', 'y'].includes(s)) return 1;
  if (['0', 'нет', 'no', 'false', '-', 'нету'].includes(s)) return 0;
  const n = Number.parseInt(s, 10);
  return n === 0 ? 0 : 1;
}

function extractRow(raw, fieldMap) {
  const gv = canon => {
    const sk = fieldMap[canon];
    if (!sk || !(sk in raw)) return { has: false };
    const v = raw[sk];
    if (v === undefined || v === null) return { has: true, v: '' };
    return { has: true, v };
  };

  const cat = gv('category');
  const nm = gv('name');
  const pr = gv('price');

  return {
    category: cat.has ? String(cat.v ?? '').trim() : null,
    brand: (() => {
      const b = gv('brand');
      return b.has ? String(b.v ?? '').trim() : undefined;
    })(),
    name: nm.has ? String(nm.v ?? '').trim() : null,
    price: pr.has ? pr.v : undefined,

    old_price: (() => {
      const x = gv('old_price');
      return x.has ? parseNumberPrice(x.v) : undefined;
    })(),
    volume: (() => {
      const x = gv('volume');
      return x.has ? String(x.v ?? '').trim() || null : undefined;
    })(),
    nicotine: (() => {
      const x = gv('nicotine');
      return x.has ? String(x.v ?? '').trim() || null : undefined;
    })(),
    stock_qty: (() => {
      const x = gv('stock_qty');
      return x.has ? parseStockQty(x.v) : undefined;
    })(),
    in_stock: (() => {
      const x = gv('in_stock');
      return x.has ? x.v : undefined;
    })(),
    description: (() => {
      const x = gv('description');
      return x.has ? String(x.v ?? '').trim() || null : undefined;
    })(),
    sort_order: (() => {
      const x = gv('sort_order');
      return x.has ? Number.parseInt(String(x.v ?? '0'), 10) || 0 : undefined;
    })(),
    image_url: (() => {
      const x = gv('image_url');
      return x.has ? String(x.v ?? '').trim() || null : undefined;
    })(),
    category_emoji: (() => {
      const x = gv('category_emoji');
      return x.has ? String(x.v ?? '').trim().slice(0, 16) || null : undefined;
    })(),
    category_description: (() => {
      const x = gv('category_description');
      return x.has ? String(x.v ?? '').trim() || null : undefined;
    })(),
    category_sort: (() => {
      const x = gv('category_sort');
      return x.has ? Number.parseInt(String(x.v ?? '0'), 10) || 0 : undefined;
    })(),

    _hasBrandColumn: !!fieldMap.brand,
    _hasImageColumn: !!fieldMap.image_url,
    _hasDescriptionColumn: !!fieldMap.description,
    _hasOldPriceColumn: !!fieldMap.old_price,
    _hasSortOrderColumn: !!fieldMap.sort_order,
    _hasVolumeColumn: !!fieldMap.volume,
    _hasNicotineColumn: !!fieldMap.nicotine,
    _hasStockColumn: !!fieldMap.stock_qty,
    _hasInStockColumn: !!fieldMap.in_stock,
  };
}

function validateParsed(parsed) {
  if (!parsed.category) return 'Пустая категория';
  if (!parsed.name) return 'Пустое название товара';
  if (parsed.price === undefined || parsed.price === '') return 'Нужна цена';
  const pr = typeof parsed.price === 'number' ? parsed.price : parseNumberPrice(parsed.price);
  if (pr == null || pr < 0) return `Некорректная цена: "${parsed.price}"`;
  parsed._priceNum = pr;
  if (parsed.old_price !== undefined && parsed.old_price != null) {
    const o = parsed.old_price;
    if (typeof o !== 'number' || o < 0) return 'Некорректная старая цена';
  }
  let sq = parsed.stock_qty !== undefined ? parsed.stock_qty : -1;
  if (!Number.isFinite(sq)) sq = -1;
  parsed._stockQtyResolved = sq;
  parsed._inStockResolved = parseInStock(parsed.in_stock, sq);
  if (sq === 0) parsed._inStockResolved = 0;
  return null;
}

async function resolveUniqueCategorySlug(desiredSlug, canonicalNameTrimmed) {
  let sl = desiredSlug || 'category';
  let n = 0;
  while (true) {
    const row = await get('SELECT id, name FROM categories WHERE slug = ?', [sl]);
    if (!row) return sl;
    const same = String(row.name || '').trim().toLowerCase() === canonicalNameTrimmed.toLowerCase();
    if (same) return sl;
    n += 1;
    sl = `${desiredSlug}-${n}`;
  }
}

/**
 * Возвращает строку categories из БД.
 * dryRun: только читает БД, при отсутствии — не вставляет и не возвращает объект.
 */
async function ensureCategory(parsed, dryRun, categoriesToCreateSlugs) {
  const name = parsed.category.trim();
  const base = slugify(name);
  const slug = await resolveUniqueCategorySlug(base, name);

  let cat = await get('SELECT * FROM categories WHERE slug = ?', [slug]);
  if (
    cat &&
    String(cat.name || '')
      .trim()
      .toLowerCase() !== name.toLowerCase()
  ) {
    cat = null;
  }

  if (!cat) {
    cat = await get('SELECT * FROM categories WHERE lower(trim(name)) = lower(trim(?))', [name]);
  }

  if (!cat) {
    if (dryRun) {
      categoriesToCreateSlugs.add(slug);
      return { row: null, slug, name };
    }

    const emoji = (parsed.category_emoji && parsed.category_emoji.trim()) || '📦';
    const descr = parsed.category_description != null ? parsed.category_description : null;
    const sortOrder = parsed.category_sort !== undefined ? Number(parsed.category_sort) || 0 : 0;

    const ins = await run(
      'INSERT INTO categories (name, slug, emoji, description, sort_order, image_url) VALUES (?,?,?,?,?,?)',
      [name, slug, emoji, descr, sortOrder, null],
    );
    cat = await get('SELECT * FROM categories WHERE id = ?', [ins.lastInsertRowid]);
  }

  return { row: cat, slug, name };
}

/**
 * Если бренд пустой — null. Иначе строка brands (создаём при необходимости).
 */
async function ensureBrand(categoryId, parsed, dryRun, brandsToCreateKeys) {
  const brandStr = parsed.brand?.trim() || '';
  if (!brandStr) return null;

  const bs = slugify(brandStr);

  if (!categoryId) {
    if (dryRun) brandsToCreateKeys.add(`cat-pending::${bs}`);
    return null;
  }

  let b = await get('SELECT * FROM brands WHERE category_id = ? AND slug = ?', [categoryId, bs]);
  if (b) return b;
  b = await get(
    'SELECT * FROM brands WHERE category_id = ? AND lower(trim(name)) = lower(trim(?))',
    [categoryId, brandStr],
  );
  if (b) return b;

  if (dryRun) {
    brandsToCreateKeys.add(`${categoryId}::${bs}`);
    return null;
  }

  const ins = await run(
    'INSERT INTO brands (category_id, name, slug, sort_order, image_url) VALUES (?,?,?,?,?)',
    [categoryId, brandStr, bs, 0, null],
  );
  return get('SELECT * FROM brands WHERE id = ?', [ins.lastInsertRowid]);
}

async function findExistingProduct(categoryId, itemName, brandTextForMatch) {
  const btm = brandTextForMatch == null ? '' : String(brandTextForMatch).trim();
  return get(
    `SELECT * FROM products
     WHERE category_id = ?
       AND lower(trim(name)) = lower(trim(?))
       AND lower(trim(coalesce(brand, ''))) = lower(trim(?))`,
    [categoryId, itemName, btm],
  );
}

export async function runProductImport(buffer, originalname, { dryRun = false, force = false } = {}) {
  const rows = sheetRowsFromBuffer(buffer, originalname);
  if (!rows.length) {
    return {
      dryRun,
      ok: false,
      error: 'Файл пустой (первая строка — заголовки, затем товары).',
      totalLines: 0,
      errors: [],
      preview: [],
    };
  }

  const fieldMap = detectFieldMap(rows[0]);
  if (!fieldMap.category || !fieldMap.name || !fieldMap.price) {
    return {
      dryRun,
      ok: false,
      error:
        'Нужны колонки «Категория», «Название» и «Цена» (названия столбцов могут быть русскими или как в README).',
      detectedExcelHeaders: Object.keys(rows[0] || {}),
      mappedFields: Object.keys(fieldMap),
      totalLines: rows.length,
      errors: [],
      preview: [],
    };
  }

  const errors = [];
  const workItems = [];
  for (let i = 0; i < rows.length; i++) {
    const lineNo = i + 2;
    const raw = rows[i];
    if (!raw || typeof raw !== 'object') continue;
    const nonEmpty = Object.values(raw).some(v => String(v ?? '').trim() !== '');
    if (!nonEmpty) continue;

    const parsed = extractRow(raw, fieldMap);
    const ve = validateParsed(parsed);
    if (ve) {
      errors.push({ row: lineNo, message: ve });
      continue;
    }
    workItems.push({ lineNo, parsed });
  }

  if (!dryRun && errors.length > 0 && !force) {
    return {
      dryRun: false,
      ok: false,
      aborted: true,
      message:
        'В файле есть ошибки по строкам ниже. Исправьте Excel и повторите, либо включите «форс» в админке (импорт только корректных строк).',
      errors,
      validRowCount: workItems.length,
      mappedFields: Object.keys(fieldMap),
      preview: [],
    };
  }

  if (workItems.length === 0) {
    return {
      dryRun,
      ok: false,
      error:
        errors.length === 0
          ? 'Нет данных: заполните строки под заголовками или проверьте, что нужные колонки распознались.'
          : undefined,
      totalLines: rows.length,
      validRows: 0,
      errors,
      preview: [],
      mappedFields: Object.keys(fieldMap),
    };
  }
  const brandsToCreate = new Set();
  const preview = [];
  let inserted = 0;
  let updated = 0;
  let wouldInsert = 0;
  let wouldUpdate = 0;

  for (const { lineNo, parsed } of workItems) {
    const catRes = await ensureCategory(parsed, dryRun, categoriesToCreate);
    const categoryIdForLookup = catRes.row?.id ?? null;

    let existingProd = null;
    if (categoryIdForLookup) {
      existingProd = await findExistingProduct(
        categoryIdForLookup,
        parsed.name.trim(),
        parsed.brand?.trim() ?? '',
      );
    }

    await ensureBrand(categoryIdForLookup, parsed, dryRun, brandsToCreate);

    if (dryRun) {
      if (existingProd) wouldUpdate += 1;
      else wouldInsert += 1;
      if (preview.length < 25) {
        preview.push({
          row: lineNo,
          action: existingProd ? 'обновление' : 'добавление',
          category: parsed.category.trim(),
          brand: parsed.brand?.trim() || '—',
          name: parsed.name.trim(),
          price: parsed._priceNum,
          stock: parsed._stockQtyResolved,
        });
      }
      continue;
    }

    if (!catRes.row?.id) continue;

    const finalBrandRow = await ensureBrand(catRes.row.id, parsed, false, brandsToCreate);
    const bid = finalBrandRow?.id ?? null;
    const brandTextForProduct = parsed.brand?.trim() ? parsed.brand.trim() : null;

    const prodExisting = await findExistingProduct(
      catRes.row.id,
      parsed.name.trim(),
      brandTextForProduct ?? '',
    );

    if (!prodExisting) {
      const img = parsed.image_url !== undefined ? parsed.image_url : null;
      await run(
        `INSERT INTO products (category_id, brand_id, name, brand, description, price, old_price,
          volume, nicotine, in_stock, sort_order, image_url, stock_qty)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          catRes.row.id,
          bid,
          parsed.name.trim(),
          brandTextForProduct,
          parsed.description !== undefined ? parsed.description : null,
          parsed._priceNum,
          parsed.old_price !== undefined ? parsed.old_price : null,
          parsed.volume !== undefined ? parsed.volume : null,
          parsed.nicotine !== undefined ? parsed.nicotine : null,
          parsed._inStockResolved,
          parsed.sort_order !== undefined ? Number(parsed.sort_order) || 0 : 0,
          img,
          parsed.stock_qty !== undefined ? parsed._stockQtyResolved : -1,
        ],
      );
      inserted += 1;
    } else {
      const parts = [];
      const args = [];
      parts.push('category_id = ?');
      args.push(catRes.row.id);
      parts.push('brand_id = ?');
      args.push(bid);
      parts.push('name = ?');
      args.push(parsed.name.trim());
      parts.push('brand = ?');
      args.push(brandTextForProduct);
      if (parsed._hasDescriptionColumn) {
        parts.push('description = ?');
        args.push(parsed.description !== undefined ? parsed.description : null);
      }
      parts.push('price = ?');
      args.push(parsed._priceNum);
      if (parsed._hasOldPriceColumn) {
        parts.push('old_price = ?');
        args.push(parsed.old_price !== undefined ? parsed.old_price : null);
      }
      if (parsed._hasVolumeColumn) {
        parts.push('volume = ?');
        args.push(parsed.volume !== undefined ? parsed.volume : null);
      }
      if (parsed._hasNicotineColumn) {
        parts.push('nicotine = ?');
        args.push(parsed.nicotine !== undefined ? parsed.nicotine : null);
      }
      if (parsed._hasInStockColumn || parsed._hasStockColumn) {
        parts.push('in_stock = ?');
        args.push(parsed._inStockResolved);
      }
      if (parsed._hasSortOrderColumn) {
        parts.push('sort_order = ?');
        args.push(parsed.sort_order !== undefined ? Number(parsed.sort_order) || 0 : 0);
      }
      if (parsed._hasStockColumn) {
        parts.push('stock_qty = ?');
        args.push(parsed._stockQtyResolved);
      }

      await run(`UPDATE products SET ${parts.join(', ')} WHERE id = ?`, args);
      updated += 1;
    }

    if (preview.length < 15) {
      preview.push({
        row: lineNo,
        action: prodExisting ? 'обновлено' : 'добавлено',
        category: parsed.category.trim(),
        name: parsed.name.trim(),
        price: parsed._priceNum,
      });
    }
  }

  const safeLineCount = rows.filter(r => r && Object.keys(r).length).length;

  if (!dryRun) await syncBrandsAfterBulkImport();

  return {
    dryRun,
    ok: errors.length === 0,
    force,
    totalLines: safeLineCount,
    validRows: workItems.length,
    errors,
    preview,
    mappedFields: Object.keys(fieldMap),
    stats: dryRun
      ? {
          newCategories: categoriesToCreate.size,
          newBrands: brandsToCreate.size,
          wouldInsert,
          wouldUpdate,
        }
      : { inserted, updated },
  };
}
