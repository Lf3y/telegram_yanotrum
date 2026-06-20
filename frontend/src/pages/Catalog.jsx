import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../store/cart';
import { pluralRu } from '../lib/pluralRu';
import { apiFetch, resolveImageUrl } from '../lib/api';
import { formatByn } from '../lib/money';
import { Icon, CategoryIcon, ProductImage } from '../components/icons';
import { FavoriteButton } from '../components/FavoriteButton';
import { useTilt } from '../hooks/useTilt';
import { hapticImpact, hapticSelection } from '../lib/haptics';
import { flyToCart } from '../lib/fx';
import { playAdd, playTap } from '../lib/sound';

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
 *     volume?: string,
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
  if (fp.volume?.trim()) q.set('volume', fp.volume.trim());
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
 * @param {{ minPrice?: string, maxPrice?: string, volume?: string, nicotine?: string }} filters
 * @param {string} searchQuery
 */
function brandGroupsUrl(categorySlug, filters = {}, searchQuery = '') {
  const q = new URLSearchParams();
  q.set('category', categorySlug);
  const fpMin = filters.minPrice?.trim();
  const fpMax = filters.maxPrice?.trim();
  const vol = filters.volume?.trim();
  const nic = filters.nicotine?.trim();
  if (fpMin) q.set('min_price', fpMin);
  if (fpMax) q.set('max_price', fpMax);
  if (vol) q.set('volume', vol);
  if (nic) q.set('nicotine', nic);
  if (searchQuery.trim().length >= 2) q.set('q', searchQuery.trim());
  return `/api/catalog/brand-groups?${q.toString()}`;
}

/**
 * @param {{
 *   product: Record<string, unknown>,
 *   qty: number,
 *   onInc: (ev?: import('react').MouseEvent) => void,
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
          minWidth: 36,
          minHeight: 36,
          padding: '0 10px',
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
          onInc(ev);
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
  const tiltRef = useTilt({ max: 7 });

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
    <div ref={tiltRef} className="card catalog-card-shell catalog-product-card">
      <div className="catalog-product-media catalog-product-media--fav">
        <FavoriteButton productId={id} className="favorite-btn--overlay" />
        <ProductImage
          src={resolveImageUrl(product.image_url)}
          alt={String(product.name || '')}
          className="catalog-product-img"
        />
      </div>
      <div className="catalog-product-head">
        <div className="catalog-product-brand">{product.brand || '·'}</div>
        <div className="catalog-product-title">{product.name}</div>
      </div>

      {(product.volume || product.nicotine) ? (
        <div className="catalog-product-badges">
          {product.volume && (
            <span className="badge badge-accent catalog-product-badge">{product.volume}</span>
          )}
          {product.nicotine && (
            <span className="badge catalog-product-badge catalog-product-badge--muted">{product.nicotine}</span>
          )}
        </div>
      ) : (
        <div className="catalog-product-badges catalog-product-badges--empty" aria-hidden="true" />
      )}

      <div className="catalog-product-footer">
        <div className="catalog-product-price-wrap">
          <div className="catalog-product-price-row">
            <span className="catalog-product-price">{formatByn(product.price)}</span>
            {product.old_price && (
              <span className="catalog-product-old-price">{formatByn(product.old_price)}</span>
            )}
          </div>
          {product.stock_qty != null && product.stock_qty >= 0 && product.stock_qty <= 15 && (
            <span className={`catalog-product-stock${product.stock_qty <= 3 ? ' catalog-product-stock--low' : ''}`}>
              {product.stock_qty === 0 ? 'Нет в наличии' : `Осталось ${product.stock_qty} шт.`}
            </span>
          )}
        </div>
        <ProductCardControls
          product={product}
          qty={qty}
          maxQty={maxQ}
          onInc={(ev) => {
            dispatch({ type: 'ADD', item: payload() });
            hapticImpact('light');
            playAdd();
            flyToCart(ev?.currentTarget);
          }}
          onDec={() => {
            if (qty > 0) {
              dispatch({ type: 'DEC', product_id: id });
              hapticSelection();
              playTap();
            }
          }}
        />
      </div>
    </div>
  );
}

/**
 * @param {{ category: Record<string, unknown>, onPick: () => void, index?: number }} props
 */
function CategoryCard({ category, onPick, index = 0 }) {
  const name = String(category.name || '');
  const description = String(category.description || '');
  const img = resolveImageUrl(category.image_url);

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
      <div className="catalog-category-media">
        {img ? (
          <ProductImage src={img} alt="" className="catalog-category-img" />
        ) : (
          <div className="catalog-category-icon-wrap">
            <CategoryIcon slug={category.slug} name={name} size="lg" />
          </div>
        )}
      </div>
      <div className="catalog-category-body">
        <div className="catalog-category-name">{name}</div>
        {description && (
          <div className="catalog-category-desc">{description}</div>
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
  const img = resolveImageUrl(imageUrl);

  return (
    <button
      type="button"
      className="card catalog-card-shell catalog-brand-card touch-target-min"
      onClick={(e) => {
        e.preventDefault();
        onPick();
      }}
    >
      <div className="catalog-brand-media">
        {img ? (
          <ProductImage src={img} alt="" className="catalog-brand-img" placeholderIcon="tag" />
        ) : (
          <div className="catalog-brand-icon-wrap">
            <Icon name="tag" size="md" />
          </div>
        )}
      </div>
      <div className="catalog-brand-body">
        <div className="catalog-brand-title">{title}</div>
        <div className="catalog-brand-sub">{sub}</div>
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
      <span className="catalog-search-icon" aria-hidden>
        <Icon name="search" size="sm" />
      </span>
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
          <Icon name="close" size="xs" />
        </button>
      )}
    </div>
  );
}

/**
 * Скелетон-заглушка сетки на время загрузки.
 * @param {{ count?: number, list?: boolean }} props
 */
function SkeletonGrid({ count = 6, list = false }) {
  return (
    <div className={`skeleton-grid${list ? ' skeleton-grid--list' : ''}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-line skeleton-line--media" />
          <div className="skeleton-line skeleton-line--title" />
          <div className="skeleton-line skeleton-line--text" />
          <div className="skeleton-line skeleton-line--pill" />
        </div>
      ))}
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
    volume: '',
    nicotine: '',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterMeta, setFilterMeta] = useState(() => ({
    priceMin: 0,
    priceMax: 0,
    volumeValues: /** @type {string[]} */ ([]),
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
    setFilters({ minPrice: '', maxPrice: '', volume: '', nicotine: '' });
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
          volumeValues: Array.isArray(m.volumeValues) ? m.volumeValues : [],
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

  const hasActiveFilters = Boolean(filters.minPrice || filters.maxPrice || filters.volume || filters.nicotine);

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
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="filter" size="xs" /> Фильтры{hasActiveFilters ? ' •' : ''}
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
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 6 }}>Объём</div>
              <select
                value={filters.volume}
                onChange={(ev) => setFilters((f) => ({ ...f, volume: ev.target.value }))}
                className="catalog-filter-select"
              >
                <option value="">Любой</option>
                {filterMeta.volumeValues.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
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
              onClick={() => setFilters({ minPrice: '', maxPrice: '', volume: '', nicotine: '' })}
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
              <SkeletonGrid count={6} />
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
              <SkeletonGrid count={6} />
            ) : brandGroups.length === 0 ? (
              <div className="empty" style={{ padding: '36px 0' }}>
                <div className="empty-icon"><Icon name="tag" size="xl" /></div>
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
                  <div className="catalog-all-products-title">
                    <Icon name="clipboard" size="sm" /> Все товары категории
                  </div>
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
              <SkeletonGrid count={6} />
            ) : view === 'search' && debouncedSearch.length < 2 ? (
              <div className="empty" style={{ padding: '32px 0' }}>
                <div className="empty-icon"><Icon name="search" size="xl" /></div>
                <div className="empty-title">Начните вводить запрос</div>
                <p style={{ fontSize: 14, color: 'var(--text3)' }}>Минимум 2 символа для поиска по всему каталогу</p>
              </div>
            ) : products.length === 0 ? (
              <div className="empty">
                <div className="empty-icon"><Icon name="package" size="xl" /></div>
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
