import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../store/cart';
import { pluralRu } from '../lib/pluralRu';
import { apiFetch } from '../lib/api';
import { formatByn } from '../lib/money';

/**
 * @typedef {'categories'|'brands'|'products'|'search'} CatalogView
 */

/**
 * Строит запрос списка товаров.
 * @param {{
 *   categorySlug?: string|null,
 *   producer?: string|null,
 *   unbranded?: boolean,
 *   searchQuery?: string,
 *   filters: {
 *     minPrice?: string,
 *     maxPrice?: string,
 *     nicotine?: string,
 *   },
 * }} cfg
 */
function productsQuery(cfg) {
  const q = new URLSearchParams();
  const cat = cfg.categorySlug;
  const fp = cfg.filters || {};

  if (cat) q.set('category', cat);
  if (cfg.unbranded) q.set('unbranded', '1');
  else if (cfg.producer?.trim()) q.set('producer', cfg.producer.trim());

  if (fp.minPrice?.trim()) q.set('min_price', fp.minPrice.trim());
  if (fp.maxPrice?.trim()) q.set('max_price', fp.maxPrice.trim());
  if (fp.nicotine?.trim()) q.set('nicotine', fp.nicotine.trim());
  if (cfg.searchQuery?.trim() && cfg.searchQuery.trim().length >= 2) {
    q.set('q', cfg.searchQuery.trim());
  }

  const qs = q.toString();
  return qs ? `/api/products?${qs}` : '/api/products';
}

/**
 * @param {string|null|undefined} categorySlug
 */
function filtersMetaUrl(categorySlug) {
  const q = new URLSearchParams();
  if (categorySlug) q.set('category', categorySlug);
  const s = q.toString();
  return s ? `/api/products/filter-meta?${s}` : '/api/products/filter-meta';
}

/**
 * @param {string} categorySlug
 * @param {{ minPrice?: string, maxPrice?: string, nicotine?: string }} filters
 * @param {string} searchQuery
 */
function brandGroupsUrl(categorySlug, filters = {}, searchQuery = '') {
  const q = new URLSearchParams();
  q.set('category', categorySlug);
  const fpMin = filters.minPrice?.trim();
  const fpMax = filters.maxPrice?.trim();
  const nic = filters.nicotine?.trim();
  if (fpMin) q.set('min_price', fpMin);
  if (fpMax) q.set('max_price', fpMax);
  if (nic) q.set('nicotine', nic);
  if (searchQuery.trim().length >= 2) q.set('q', searchQuery.trim());
  return `/api/catalog/brand-groups?${q.toString()}`;
}

/**
 * @param {{
 *   product: Record<string, unknown>,
 *   qty: number,
 *   onInc: () => void,
 *   onDec: () => void,
 *   maxQty: number,
 * }} props
 */
function ProductCardControls({ product, qty, onInc, onDec, maxQty }) {
  const stock = product.stock_qty;
  const numberedStock = typeof stock !== 'undefined' && stock !== null && Number(stock) >= 0;
  const capped = qty >= maxQty;
  const disablePlus = capped || numberedStock === true && Number(stock) === 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
      <button
        type="button"
        className="touch-target-min"
        onClick={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          onDec();
        }}
        disabled={qty <= 0}
        style={{
          minWidth: 44,
          minHeight: 44,
          padding: '0 12px',
          borderRadius: 12,
          background: qty > 0 ? 'var(--bg4)' : 'transparent',
          color: qty > 0 ? 'var(--text)' : 'var(--text3)',
          fontSize: 22,
          fontWeight: 700,
          opacity: qty > 0 ? 1 : 0.35,
          flexShrink: 0,
          border: qty > 0 ? '1px solid var(--border)' : '1px dashed transparent',
        }}
        aria-label="Уменьшить количество"
      >
        −
      </button>
      <div
        style={{
          fontSize: qty > 0 ? 13 : 12,
          fontWeight: 700,
          minWidth: 56,
          textAlign: 'center',
          color: qty > 0 ? 'var(--accent2)' : 'var(--text3)',
          lineHeight: 1.2,
          flexShrink: 0,
          padding: '4px 0',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'manipulation',
        }}
      >
        {qty > 0 ? (
          <>
            {qty}{' '}
            {pluralRu(qty, 'штучка', 'штучки', 'штучек')}
          </>
        ) : (
          <span style={{ color: 'var(--text3)', fontWeight: 600 }}>—</span>
        )}
      </div>
      <button
        type="button"
        className="touch-target-min"
        onClick={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          onInc();
        }}
        disabled={Boolean(disablePlus)}
        aria-disabled={disablePlus ? true : undefined}
        aria-label={qty ? 'Ещё одна единица' : 'Добавить'}
        style={{
          minWidth: 44,
          minHeight: 44,
          borderRadius: 12,
          background: qty > 0 ? 'rgba(34,197,94,0.14)' : 'var(--accent)',
          color: qty > 0 ? 'var(--green)' : 'white',
          border: qty > 0 ? `1px solid rgba(34,197,94,0.35)` : 'none',
          fontWeight: 800,
          fontSize: qty > 0 ? 15 : 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          opacity: disablePlus ? 0.4 : 1,
          cursor: disablePlus ? 'not-allowed' : 'pointer',
        }}
      >
        +
      </button>
    </div>
  );
}

/**
 * @param {{ product: Record<string, unknown> }} props
 */
function ProductCard({ product }) {
  const { dispatch, cart } = useCart();

  const id = Number(product.id);
  const qty = cart.find((c) => c.product_id === id)?.qty || 0;
  const stockRaw = product.stock_qty;
  const maxQ =
    stockRaw !== undefined &&
    stockRaw !== null &&
    Number(stockRaw) >= 0 &&
    Number.isFinite(Number(stockRaw))
      ? Number(stockRaw)
      : Number.POSITIVE_INFINITY;

  const payload = () => ({
    product_id: id,
    name: String(product.name || ''),
    brand: product.brand != null ? String(product.brand) : '',
    price: Number(product.price),
    stock_qty: stockRaw,
  });

  return (
    <div
      className="card catalog-card-shell"
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
        overflow: 'hidden',
        touchAction: 'manipulation',
      }}
    >
      {product.image_url && (
        <div
          style={{
            height: 96,
            borderRadius: 12,
            overflow: 'hidden',
            background: 'var(--bg4)',
            border: '1px solid var(--border)',
            pointerEvents: 'none',
          }}
        >
          <img
            src={String(product.image_url)}
            alt={String(product.name || '')}
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
            draggable={false}
            loading="lazy"
          />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11,
            color: 'var(--text3)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 3,
            overflowWrap: 'anywhere',
          }}>
            {product.brand || '·'}
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.2,
            marginBottom: 4,
            color: 'var(--text)',
            overflowWrap: 'anywhere',
          }}>
            {product.name}
          </div>
          {product.description && (
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
              {product.description}
            </div>
          )}
        </div>
      </div>

      {(product.volume || product.nicotine) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: 'none' }}>
          {product.volume && (
            <span className="badge badge-accent" style={{ fontSize: 11 }}>{product.volume}</span>
          )}
          {product.nicotine && (
            <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text2)', fontSize: 11 }}>
              {product.nicotine}
            </span>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginTop: 'auto',
          flexShrink: 0,
          position: 'relative',
          zIndex: 5,
          isolation: 'isolate',
          touchAction: 'manipulation',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>
                {formatByn(product.price)}
              </span>
              {product.old_price && (
                <span style={{ fontSize: 13, color: 'var(--text3)', textDecoration: 'line-through' }}>
                  {formatByn(product.old_price)}
                </span>
              )}
            </div>
            {product.stock_qty != null && product.stock_qty >= 0 && product.stock_qty <= 15 && (
              <span
                style={{
                  fontSize: 11,
                  color: product.stock_qty <= 3 ? 'var(--accent2)' : 'var(--text3)',
                  fontWeight: 600,
                }}
              >
                {product.stock_qty === 0 ? 'Нет в наличии' : `Осталось ${product.stock_qty} шт.`}
              </span>
            )}
          </div>
          <ProductCardControls
            product={product}
            qty={qty}
            maxQty={maxQ}
            onInc={() => dispatch({ type: 'ADD', item: payload() })}
            onDec={() => qty > 0 && dispatch({ type: 'DEC', product_id: id })}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{ category: Record<string, unknown>, onPick: () => void, index?: number }} props
 */
function CategoryCard({ category, onPick, index = 0 }) {
  const emoji = String(category.emoji || '📦');
  const name = String(category.name || '');
  const description = String(category.description || '');

  return (
    <button
      type="button"
      className="card catalog-category-card touch-target-min"
      onClick={onPick}
      style={{
        padding: 0,
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'left',
        width: '100%',
        animation: `fadeUp 0.4s ${0.05 * index}s ease both`,
        opacity: 0,
        animationFillMode: 'forwards',
      }}
    >
      {category.image_url ? (
        <div style={{ height: 96, background: 'var(--bg4)' }}>
          <img
            src={String(category.image_url)}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        </div>
      ) : (
        <div
          style={{
            height: 72,
            background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.15) 0%, var(--bg4) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 36,
          }}
        >
          {emoji}
        </div>
      )}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text)',
            overflowWrap: 'anywhere',
          }}
        >
          {emoji} {name}
        </div>
        {description && (
          <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
            {description}
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * @param {{
 *   brandLabel: string|null,
 *   count: number,
 *   imageUrl?: string|null,
 *   onPick: () => void,
 * }} props
 */
function BrandCard({ brandLabel, count, imageUrl, onPick }) {
  const title = brandLabel?.trim() ? brandLabel.trim() : 'Без бренда';
  const sub = `${count} ${pluralRu(Number(count), 'вкус', 'вкуса', 'вкусов')}`;

  return (
    <button
      type="button"
      className="card catalog-card-shell catalog-brand-card touch-target-min"
      onClick={(e) => {
        e.preventDefault();
        onPick();
      }}
      style={{
        padding: 0,
        width: '100%',
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        touchAction: 'manipulation',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
        overflow: 'hidden',
      }}
    >
      {imageUrl ? (
        <div style={{ height: 72, background: 'var(--bg4)' }}>
          <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
        </div>
      ) : (
        <div
          style={{
            height: 56,
            background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.12) 0%, var(--bg4) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
          }}
        >
          🏷️
        </div>
      )}
      <div style={{ padding: '14px 16px 16px' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            fontWeight: 800,
            color: 'var(--text)',
            marginBottom: 4,
            lineHeight: 1.25,
            overflowWrap: 'anywhere',
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>{sub}</div>
      </div>
    </button>
  );
}

/**
 * @param {{ value: string, onChange: (v: string) => void, placeholder?: string }} props
 */
function CatalogSearchBar({ value, onChange, placeholder = 'Поиск по названию или бренду…' }) {
  return (
    <div className="catalog-search-wrap">
      <span className="catalog-search-icon" aria-hidden>🔍</span>
      <input
        type="search"
        className="catalog-search-input"
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        placeholder={placeholder}
        enterKeyHint="search"
        autoComplete="off"
      />
      {value.length > 0 && (
        <button
          type="button"
          className="catalog-search-clear touch-target-min"
          onClick={() => onChange('')}
          aria-label="Очистить поиск"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default function Catalog() {
  const { slug: categorySlug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [categories, setCategories] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [brandGroups, setBrandGroups] = useState(
    /** @type {{ brand: string|null, slug: string, count: number, image_url?: string|null }[]} */ ([]),
  );
  const [products, setProducts] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    nicotine: '',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterMeta, setFilterMeta] = useState(() => ({
    priceMin: 0,
    priceMax: 0,
    nicotineValues: /** @type {string[]} */ ([]),
  }));

  const producerParam = searchParams.get('producer') || '';
  const unbrandedParam = searchParams.get('unbranded') === '1';
  const showAllInCategory = searchParams.get('all') === '1';

  const activeCategory = useMemo(
    () => categories.find((c) => String(c.slug) === categorySlug) || null,
    [categories, categorySlug],
  );

  /** @type {CatalogView} */
  const view = useMemo(() => {
    if (!categorySlug) {
      return debouncedSearch.trim().length >= 2 ? 'search' : 'categories';
    }
    if (producerParam || unbrandedParam || showAllInCategory) return 'products';
    return 'brands';
  }, [categorySlug, debouncedSearch, producerParam, unbrandedParam, showAllInCategory]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    apiFetch('/api/categories')
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!categorySlug) return;
    setSearchInput('');
    setDebouncedSearch('');
    setFilters({ minPrice: '', maxPrice: '', nicotine: '' });
    setFiltersOpen(false);
  }, [categorySlug]);

  useEffect(() => {
    if (view !== 'products' && view !== 'brands') return;
    apiFetch(filtersMetaUrl(categorySlug || null))
      .then((r) => r.json())
      .then((m) =>
        setFilterMeta({
          priceMin: typeof m.priceMin === 'number' ? m.priceMin : 0,
          priceMax: typeof m.priceMax === 'number' ? m.priceMax : 0,
          nicotineValues: Array.isArray(m.nicotineValues) ? m.nicotineValues : [],
        }),
      )
      .catch(() => {});
  }, [view, categorySlug]);

  useEffect(() => {
    if (view !== 'brands' || !categorySlug) {
      setBrandGroups([]);
      return undefined;
    }

    setGroupsLoading(true);
    let cancelled = false;
    apiFetch(brandGroupsUrl(categorySlug, filters, debouncedSearch))
      .then((r) => r.json())
      .then((rows) => {
        if (!cancelled) setBrandGroups(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setBrandGroups([]);
      })
      .finally(() => {
        if (!cancelled) setGroupsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [view, categorySlug, filters, debouncedSearch]);

  useEffect(() => {
    if (view !== 'products' && view !== 'search') {
      setProducts([]);
      setLoading(false);
      setLoadError('');
      return undefined;
    }

    setLoading(true);
    setLoadError('');

    const url = productsQuery({
      categorySlug: view === 'search' ? null : categorySlug,
      producer: unbrandedParam ? null : producerParam,
      unbranded: unbrandedParam,
      searchQuery: debouncedSearch,
      filters,
    });

    let cancelled = false;
    apiFetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setProducts(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setProducts([]);
          setLoadError(String(e.message || 'Не удалось загрузить товары'));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [view, categorySlug, producerParam, unbrandedParam, debouncedSearch, filters]);

  const headerTitle = useMemo(() => {
    if (view === 'categories') return 'Каталог';
    if (view === 'search') return 'Поиск';
    if (view === 'brands') return activeCategory ? String(activeCategory.name) : 'Категория';
    if (unbrandedParam) return 'Без бренда';
    if (showAllInCategory) return activeCategory ? String(activeCategory.name) : 'Все товары';
    return producerParam || (activeCategory ? String(activeCategory.name) : 'Товары');
  }, [view, activeCategory, producerParam, unbrandedParam, showAllInCategory]);

  const headerSubtitle = useMemo(() => {
    if (view === 'categories') return 'Выберите категорию';
    if (view === 'brands') return 'Выберите бренд';
    if (view === 'search') {
      return debouncedSearch.length >= 2
        ? `${products.length} ${pluralRu(products.length, 'результат', 'результата', 'результатов')}`
        : 'Введите минимум 2 символа';
    }
    return `${products.length} ${pluralRu(products.length, 'товар', 'товара', 'товаров')}`;
  }, [view, products.length, debouncedSearch.length]);

  const applySuggestedPriceRange = useCallback(() => {
    const { priceMin: mn, priceMax: mx } = filterMeta;
    setFilters((p) => ({
      ...p,
      minPrice: p.minPrice || (Number.isFinite(mn) ? String(Math.floor(mn)) : ''),
      maxPrice: p.maxPrice || (Number.isFinite(mx) ? String(Math.ceil(mx)) : ''),
    }));
  }, [filterMeta]);

  const goToCategories = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    navigate('/catalog');
  }, [navigate]);

  const goToBrands = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    if (categorySlug) navigate(`/catalog/${categorySlug}`);
  }, [navigate, categorySlug]);

  const pickBrand = useCallback((brandLabel) => {
    setSearchInput('');
    setDebouncedSearch('');
    const next = new URLSearchParams();
    if (brandLabel?.trim()) {
      next.set('producer', brandLabel.trim());
    } else {
      next.set('unbranded', '1');
    }
    setSearchParams(next);
  }, [setSearchParams]);

  const pickAllProducts = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setSearchParams({ all: '1' });
  }, [setSearchParams]);

  const hasActiveFilters = Boolean(filters.minPrice || filters.maxPrice || filters.nicotine);

  return (
    <div className="page catalog-page">
      <div className="header">
        <div style={{ flex: 1, minWidth: 0 }}>
          {view !== 'categories' && (
            <button
              type="button"
              className="catalog-back-btn touch-target-min"
              onClick={() => {
                if (view === 'products') goToBrands();
                else goToCategories();
              }}
            >
              ← Назад
            </button>
          )}
          <div className="header-title">{headerTitle}</div>
          <div className="header-sub">{headerSubtitle}</div>
        </div>
      </div>

      <div style={{ padding: '0 16px 10px' }}>
        <CatalogSearchBar
          value={searchInput}
          onChange={setSearchInput}
          placeholder={
            view === 'categories'
              ? 'Поиск по всему каталогу…'
              : view === 'brands'
                ? 'Найти бренд или вкус…'
                : 'Поиск внутри категории…'
          }
        />
      </div>

      {(view === 'products' || view === 'brands') && (
        <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="touch-target-min"
            onClick={() =>
              setFiltersOpen((x) => {
                const next = !x;
                if (next && !filters.minPrice && !filters.maxPrice) applySuggestedPriceRange();
                return next;
              })}
            style={{
              padding: '8px 14px',
              minHeight: 40,
              borderRadius: 10,
              border: `1px solid ${filtersOpen || hasActiveFilters ? 'var(--accent)' : 'var(--border)'}`,
              fontSize: 13,
              fontWeight: 700,
              background: filtersOpen || hasActiveFilters ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg3)',
              color: 'var(--text)',
              touchAction: 'manipulation',
            }}
          >
            ⚙️ Фильтры{hasActiveFilters ? ' •' : ''}
          </button>
        </div>
      )}

      {filtersOpen && (view === 'products' || view === 'brands') && (
        <div
          className="card catalog-card-shell"
          style={{
            margin: '0 16px 12px',
            padding: '12px',
            border: '1px solid var(--border)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>Цена (BYN)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', flex: '1 1 120px' }}>
                <span className="header-sub">От</span>
                <input
                  inputMode="decimal"
                  value={filters.minPrice}
                  onChange={(ev) => setFilters((f) => ({ ...f, minPrice: ev.target.value }))}
                  placeholder={String(filterMeta.priceMin)}
                  className="catalog-filter-input"
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', flex: '1 1 120px' }}>
                <span className="header-sub">До</span>
                <input
                  inputMode="decimal"
                  value={filters.maxPrice}
                  onChange={(ev) => setFilters((f) => ({ ...f, maxPrice: ev.target.value }))}
                  placeholder={String(filterMeta.priceMax)}
                  className="catalog-filter-input"
                />
              </label>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 6 }}>Никотин</div>
              <select
                value={filters.nicotine}
                onChange={(ev) => setFilters((f) => ({ ...f, nicotine: ev.target.value }))}
                className="catalog-filter-select"
              >
                <option value="">Любая</option>
                {filterMeta.nicotineValues.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-outline"
              style={{ width: '100%', padding: '12px', touchAction: 'manipulation' }}
              onClick={() => setFilters({ minPrice: '', maxPrice: '', nicotine: '' })}
            >
              Сбросить фильтры
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: '4px 16px 8px', position: 'relative', isolation: 'isolate' }}>
        {loadError && (
          <div className="catalog-error-banner">
            <div style={{ fontWeight: 700, color: 'var(--accent2)', marginBottom: 6 }}>Не загрузилось из API</div>
            <div>{loadError}</div>
          </div>
        )}

        {view === 'categories' && debouncedSearch.length < 2 && (
          <>
            {categories.length === 0 ? (
              <div className="spinner" />
            ) : (
              <div className="catalog-category-grid">
                {categories.map((cat, i) => (
                  <CategoryCard
                    key={String(cat.id)}
                    category={cat}
                    index={i}
                    onPick={() => navigate(`/catalog/${String(cat.slug)}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {view === 'brands' && (
          <>
            {groupsLoading ? (
              <div className="spinner" />
            ) : brandGroups.length === 0 ? (
              <div className="empty" style={{ padding: '36px 0' }}>
                <div className="empty-icon">🏷️</div>
                <div className="empty-title">Нет брендов</div>
                <p style={{ fontSize: 14 }}>Попробуйте другой запрос или сбросьте фильтры</p>
              </div>
            ) : (
              <div className="catalog-brand-grid">
                <button
                  type="button"
                  className="card catalog-card-shell catalog-all-products-card touch-target-min"
                  onClick={pickAllProducts}
                >
                  <div style={{ fontWeight: 800, fontSize: 15 }}>📋 Все товары категории</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text3)' }}>
                    Показать полный список без выбора бренда
                  </div>
                </button>
                {brandGroups.map((g) => (
                  <div key={`${g.slug}-${g.brand ?? 'nb'}`} className="catalog-brand-pop">
                    <BrandCard
                      brandLabel={g.brand}
                      count={g.count}
                      imageUrl={g.image_url}
                      onPick={() => pickBrand(g.brand)}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {(view === 'products' || view === 'search') && (
          <>
            {loading ? (
              <div className="spinner" />
            ) : view === 'search' && debouncedSearch.length < 2 ? (
              <div className="empty" style={{ padding: '32px 0' }}>
                <div className="empty-icon">🔍</div>
                <div className="empty-title">Начните вводить запрос</div>
                <p style={{ fontSize: 14, color: 'var(--text3)' }}>Минимум 2 символа для поиска по всему каталогу</p>
              </div>
            ) : products.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">📦</div>
                <div className="empty-title">Ничего не найдено</div>
                <p style={{ fontSize: 14, color: 'var(--text3)' }}>Попробуйте другой запрос или сбросьте фильтры</p>
              </div>
            ) : (
              <div className="catalog-product-grid">
                {products.map((p, i) => (
                  <div
                    key={String(p.id)}
                    className="catalog-grid-pop"
                    style={{ minWidth: 0, animationDelay: `${Math.min(i, 12) * 0.03}s` }}
                  >
                    <ProductCard product={p} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
