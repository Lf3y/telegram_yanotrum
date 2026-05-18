import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../store/cart';
import { pluralRu } from '../lib/pluralRu';
import { apiFetch } from '../lib/api';
import { formatByn } from '../lib/money';

/**
 * Строит запрос каталога.
 * @param {{
 * categorySlug?: string|null,
 * brandSlugFromPills?: string|null,
 * narrowProducer?: string|null,
 * unbrandedNarrow?: boolean,
 * forceFlatBrowse?: boolean,
 * useTieredBrandBrowse?: boolean,
 * filters: {
 *minPrice?: string,
 *maxPrice?: string,
 *nicotine?: string,
 *producer?: string,
 * },
 * }} cfg
 */
function productsQuery(cfg) {
  const q = new URLSearchParams();
  const cat = cfg.categorySlug;
  const brandPill = cfg.brandSlugFromPills;
  const fp = cfg.filters || {};
  const fpMin = fp.minPrice?.trim();
  const fpMax = fp.maxPrice?.trim();
  const nic = fp.nicotine?.trim();
  const fpProducer = fp.producer?.trim();

  if (cat && cat !== 'all') q.set('category', cat);
  if (cat && cat !== 'all' && brandPill && brandPill !== 'all') q.set('brand', brandPill);

  if (fpMin) q.set('min_price', fpMin);
  if (fpMax) q.set('max_price', fpMax);
  if (nic) q.set('nicotine', nic);

  const unbrand = cfg.unbrandedNarrow === true;
  const tier = cfg.narrowProducer?.trim?.() ? cfg.narrowProducer.trim() : null;
  const forceFlat = cfg.forceFlatBrowse === true;
  const tiered = cfg.useTieredBrandBrowse === true && !forceFlat;

  if (tiered) {
    if (unbrand) q.set('unbranded', '1');
    else if (tier) q.set('producer', tier);
    else if (fpProducer && (!brandPill || brandPill === 'all')) q.set('producer', fpProducer);
  } else if (cat !== 'all' && fpProducer && (!brandPill || brandPill === 'all')) {
    q.set('producer', fpProducer);
  }

  const qs = q.toString();
  return qs ? `/api/products?${qs}` : '/api/products';
}

function filtersMetaUrl(categorySlugOrAll) {
  const q = new URLSearchParams();
  if (categorySlugOrAll && categorySlugOrAll !== 'all') {
    q.set('category', categorySlugOrAll);
  }
  const s = q.toString();
  return s ? `/api/products/filter-meta?${s}` : '/api/products/filter-meta';
}

function brandGroupsUrl(categorySlugOrAll, filters = {}) {
  const q = new URLSearchParams();
  if (categorySlugOrAll && categorySlugOrAll !== 'all') {
    q.set('category', categorySlugOrAll);
  }
  const fpMin = filters.minPrice?.trim();
  const fpMax = filters.maxPrice?.trim();
  const nic = filters.nicotine?.trim();
  if (fpMin) q.set('min_price', fpMin);
  if (fpMax) q.set('max_price', fpMax);
  if (nic) q.set('nicotine', nic);
  const s = q.toString();
  return s ? `/api/catalog/brand-groups?${s}` : '/api/catalog/brand-groups';
}

/**
 * @param {{
 *product: Record<string, unknown>,
 * qty: number,
 * onInc: () => void,
 * onDec: () => void,
 * maxQty: number,
 * loading?: boolean,
 * }} props
 */
function ProductCardControls({ product, qty, onInc, onDec, maxQty }) {
  const stock = product.stock_qty;
  const numberedStock = typeof stock !== 'undefined' && stock !== null && Number(stock) >= 0;
  const capped = qty >= maxQty;
  const disablePlus = capped || numberedStock === true && Number(stock) === 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
      }}
    >
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
 * @param {{
 *product: Record<string, unknown>,
 * }} props
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

  /** Данные строки корзины: имя, бренд, остаток для лимита. */
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
          <img src={product.image_url} alt={String(product.name || '')}
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
            draggable={false}
            loading="lazy"
          />
        </div>
      )}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
          minWidth: 0,
        }}
      >
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
            <span
              className="badge"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text2)', fontSize: 11 }}
            >
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
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 20,
                  fontWeight: 800,
                  color: 'var(--text)',
                }}
              >
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
            onDec={() =>
              qty > 0 && dispatch({
                type: 'DEC',
                product_id: id,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Карточка бренда (вкладка «Все»).
 */
function BrandTierCard({ brandLabel, slug, count, onPick }) {
  const title =
    brandLabel && String(brandLabel).trim()
      ? String(brandLabel).trim()
      : 'Без названия производителя';
  const sub =
    `${count} ${pluralRu(Number(count), 'вкус', 'вкуса', 'вкусов')}`;
  return (
    <button
      type="button"
      className="card catalog-card-shell touch-target-min"
      onClick={(e) => {
        e.preventDefault();
        onPick(brandLabel, slug);
      }}
      style={{
        padding: '16px',
        width: '100%',
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        touchAction: 'manipulation',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 16,
          fontWeight: 800,
          color: 'var(--text)',
          marginBottom: 4,
          lineHeight: 1.25,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>
        {sub}
      </div>
    </button>
  );
}

export default function Catalog() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [activeBrand, setActiveBrand] = useState('all');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  /** Вкладки «Все» и «Картриджи»: сначала выбор производителя (строка brand), затем товары. */
  const [allBrowseTier, setAllBrowseTier] = useState(() => ({
    /** 'brands' | 'products' | 'products_flat' — полный список без деления по бренду. */
    mode: /** @type {'brands'|'products'|'products_flat'} */ ('brands'),
    producer: /** @type {string|null} */ (null),
    unbranded: false,
  }));
  /** Боковые / верхние фильтры. */
  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    nicotine: '',
    producer: '',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterMeta, setFilterMeta] = useState(() => ({
    priceMin: 0,
    priceMax: 0,
    nicotineValues: /** @type {string[]} */ ([]),
    manufacturers: /** @type {{ name: string, slug: string }[]} */ ([]),
  }));
  const [brandGroups, setBrandGroups] = useState(/** @type {{ brand: string|null, slug: string, count: number }[]} */ []);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const activeSlug = slug || 'all';

  /** Двухшаговый каталог по полю brand (глобально или внутри «Картриджи»). */
  const useTieredBrandBrowse =
    activeSlug === 'all' || activeSlug === 'cartridges';

  const browsingBrandTiles = useMemo(
    () =>
      useTieredBrandBrowse &&
      allBrowseTier.mode === 'brands' &&
      !filters.producer.trim(),
    [useTieredBrandBrowse, allBrowseTier.mode, filters.producer],
  );

  const resetAllBrowseForTab = useCallback(() => {
    setAllBrowseTier({ mode: 'brands', producer: null, unbranded: false });
  }, []);

  useEffect(() => {
    apiFetch('/api/categories')
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  }, []);

  /** Смена вкладки категории: сбрасываем навигацию «Все» и фильтры производитель/нише. */
  useEffect(() => {
    resetAllBrowseForTab();
    setFilters((prev) => ({ ...prev, producer: '' }));
    setActiveBrand('all');
  }, [activeSlug, resetAllBrowseForTab]);

  /** Выбор производителя из фильтра — выход из сетки брендов (шаг «Все» / «Картриджи»). */
  useEffect(() => {
    if (!useTieredBrandBrowse) return;
    const fp = filters.producer.trim();
    if (!fp) return;
    setAllBrowseTier(() => ({
      mode: 'products',
      producer: null,
      unbranded: false,
    }));
  }, [filters.producer, useTieredBrandBrowse]);

  useEffect(() => {
    if (activeSlug === 'all') {
      setBrands([]);
      return;
    }
    apiFetch(`/api/brands?category=${encodeURIComponent(activeSlug)}`)
      .then((r) => r.json())
      .then((data) => setBrands(Array.isArray(data) ? data : []))
      .catch(() => setBrands([]));
  }, [activeSlug]);

  /** Метаданные под фильтры (диапазон цен, производители, крепости). */
  useEffect(() => {
    apiFetch(filtersMetaUrl(activeSlug))
      .then((r) => r.json())
      .then((m) =>
        setFilterMeta({
          priceMin: typeof m.priceMin === 'number' ? m.priceMin : 0,
          priceMax: typeof m.priceMax === 'number' ? m.priceMax : 0,
          nicotineValues: Array.isArray(m.nicotineValues) ? m.nicotineValues : [],
          manufacturers: Array.isArray(m.manufacturers) ? m.manufacturers : [],
        }),
      )
      .catch(() => {});
  }, [activeSlug]);

  /** Сетка производителей по полю brand (вкладка «Все» или категория «Картриджи»). */
  useEffect(() => {
    const needGroups = browsingBrandTiles;

    if (!needGroups) {
      setBrandGroups([]);
      return;
    }

    setGroupsLoading(true);
    apiFetch(brandGroupsUrl(activeSlug === 'all' ? null : activeSlug, filters))
      .then((r) => r.json())
      .then((rows) =>
        setBrandGroups(Array.isArray(rows) ? rows : []))
      .catch(() => setBrandGroups([]))
      .finally(() => setGroupsLoading(false));
  }, [
    browsingBrandTiles,
    activeSlug,
    filters.minPrice,
    filters.maxPrice,
    filters.nicotine,
    filters.producer,
  ]);

  useEffect(() => {
    /** Не загружаем товары, пока показывается только выбор бренда. */
    if (browsingBrandTiles) {
      setProducts([]);
      setLoading(false);
      setLoadError('');
      return undefined;
    }

    setLoading(true);
    setLoadError('');

    const url = productsQuery({
      categorySlug: activeSlug,
      brandSlugFromPills: activeBrand,
      filters,
      narrowProducer: allBrowseTier.producer,
      unbrandedNarrow: allBrowseTier.unbranded,
      forceFlatBrowse:
        useTieredBrandBrowse && allBrowseTier.mode === 'products_flat',
      useTieredBrandBrowse,
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
  }, [
    activeSlug,
    activeBrand,
    filters,
    allBrowseTier,
    browsingBrandTiles,
    useTieredBrandBrowse,
  ]);

  const headerSubtitle = useMemo(() => {
    if (browsingBrandTiles) return 'Сначала выберите производителя';
    return `${products.length} ${pluralRu(products.length, 'товар', 'товара', 'товаров')}`;
  }, [browsingBrandTiles, products.length]);

  /** Подстроить фильтры по метаданным (первый заход при пустых полях). */
  const applySuggestedPriceRange = useCallback(() => {
    const { priceMin: mn, priceMax: mx } = filterMeta;
    setFilters((p) => ({
      ...p,
      minPrice: p.minPrice || (Number.isFinite(mn) ? String(Math.floor(mn)) : ''),
      maxPrice: p.maxPrice || (Number.isFinite(mx) ? String(Math.ceil(mx)) : ''),
    }));
  }, [filterMeta]);

  return (
    <div className="page catalog-page">
      <div className="header">
        <div>
          <div className="header-title">Каталог</div>
          <div className="header-sub">{headerSubtitle}</div>
        </div>
      </div>

      <div
        className="catalog-h-scroll"
        style={{ overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ display: 'flex', gap: 8, padding: '0 16px', width: 'max-content' }}>
          {[{ slug: 'all', name: 'Все', emoji: '🛍' }, ...categories].map((cat) => {
            const slugKey = cat.slug;
            const isActive = slugKey === activeSlug;
            return (
              <button
                key={slugKey || cat.name}
                type="button"
                className="touch-target-min"
                onClick={() => navigate(cat.slug === 'all' ? '/catalog' : `/catalog/${cat.slug}`)}
                style={{
                  padding: '11px 18px',
                  minHeight: 44,
                  borderRadius: 99,
                  fontSize: 14,
                  fontWeight: 600,
                  background: isActive ? 'var(--accent)' : 'var(--bg3)',
                  color: isActive ? 'white' : 'var(--text2)',
                  border: isActive ? 'none' : '1px solid var(--border)',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  touchAction: 'manipulation',
                }}
              >
                {cat.emoji} {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Фильтры */}
      <div style={{ padding: '10px 16px 6px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
            border: `1px solid ${filtersOpen ? 'var(--accent)' : 'var(--border)'}`,
            fontSize: 13,
            fontWeight: 700,
            background: filtersOpen ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg3)',
            color: 'var(--text)',
            touchAction: 'manipulation',
          }}
        >
          ⚙️ Фильтры
        </button>
      </div>
      {filtersOpen && (
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
                  onChange={(ev) =>
                    setFilters((f) => ({
                      ...f,
                      minPrice: ev.target.value,
                    }))
                  }
                  placeholder={String(filterMeta.priceMin)}
                  style={{
                    marginTop: 4,
                    padding: '11px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    touchAction: 'manipulation',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', flex: '1 1 120px' }}>
                <span className="header-sub">До</span>
                <input
                  inputMode="decimal"
                  value={filters.maxPrice}
                  onChange={(ev) =>
                    setFilters((f) => ({
                      ...f,
                      maxPrice: ev.target.value,
                    }))
                  }
                  placeholder={String(filterMeta.priceMax)}
                  style={{
                    marginTop: 4,
                    padding: '11px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    touchAction: 'manipulation',
                  }}
                />
              </label>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 6 }}>
                Никотин
              </div>
              <select
                value={filters.nicotine}
                onChange={(ev) =>
                  setFilters((f) => ({
                    ...f,
                    nicotine: ev.target.value,
                  }))
                }
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 14,
                  minHeight: 44,
                  touchAction: 'manipulation',
                }}
              >
                <option value="">Любая</option>
                {filterMeta.nicotineValues.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 6 }}>
                Производитель (строковый бренд)
              </div>
              <select
                value={filters.producer}
                onChange={(ev) =>
                  setFilters((f) => ({
                    ...f,
                    producer: ev.target.value,
                  }))
                }
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 14,
                  minHeight: 44,
                  touchAction: 'manipulation',
                }}
              >
                <option value="">Все производители</option>
                {filterMeta.manufacturers.map((m) => (
                  <option key={m.slug || m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-outline"
              style={{ width: '100%', padding: '12px', touchAction: 'manipulation' }}
              onClick={() =>
                setFilters({
                  minPrice: '',
                  maxPrice: '',
                  nicotine: '',
                  producer: '',
                })}
            >
              Сбросить фильтры
            </button>
          </div>
        </div>
      )}

      {activeSlug !== 'all' && !browsingBrandTiles && (
        <div
          className="catalog-h-scroll"
          style={{ overflowX: 'auto', padding: '6px 0 0', WebkitOverflowScrolling: 'touch' }}
        >
          <div style={{ display: 'flex', gap: 8, padding: '0 16px', width: 'max-content' }}>
            {[{ slug: 'all', name: 'Все бренды' }, ...brands].map((b) => {
              const slugKey = b.slug;
              const isActive = slugKey === activeBrand;
              return (
                <button
                  key={slugKey || b.name}
                  type="button"
                  className="touch-target-min"
                  onClick={() => setActiveBrand(slugKey)}
                  style={{
                    padding: '11px 16px',
                    minHeight: 44,
                    borderRadius: 99,
                    fontSize: 13,
                    fontWeight: 700,
                    background: isActive ? 'rgba(var(--accent-rgb), 0.18)' : 'var(--bg3)',
                    color: isActive ? 'var(--accent2)' : 'var(--text2)',
                    border: isActive ? '1px solid rgba(var(--accent-rgb), 0.35)' : '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                    touchAction: 'manipulation',
                    flexShrink: 0,
                  }}
                >
                  {b.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/** Назад к сетке производителей и плоский список — «Все» и «Картриджи». */}
      {useTieredBrandBrowse && !browsingBrandTiles && (
          <div style={{ padding: '8px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="touch-target-min"
              onClick={() => {
                setFilters((f) => ({
                  ...f,
                  producer: '',
                }));
                setAllBrowseTier({
                  mode: 'brands',
                  producer: null,
                  unbranded: false,
                });
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                background: 'var(--bg4)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                minHeight: 44,
              }}
            >
              ← Бренды
            </button>
            <button
              type="button"
              className="touch-target-min"
              onClick={() =>
                setAllBrowseTier({ mode: 'products_flat', producer: null, unbranded: false })}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                background: allBrowseTier.mode === 'products_flat' ? 'var(--accent)' : 'var(--bg3)',
                color: allBrowseTier.mode === 'products_flat' ? 'white' : 'var(--text2)',
                border: `1px solid ${allBrowseTier.mode === 'products_flat' ? 'transparent' : 'var(--border)'}`,
                fontWeight: 700,
                minHeight: 44,
              }}
            >
              Полный список
            </button>
          </div>
      )}

      <div style={{ padding: '12px 16px 8px', position: 'relative', isolation: 'isolate' }}>
        {loadError && (
          <div
            style={{
              marginBottom: 14,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(255,45,45,0.08)',
              border: '1px solid rgba(255,45,45,0.25)',
              fontSize: 13,
              lineHeight: 1.45,
              color: 'var(--text2)',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--accent2)', marginBottom: 6 }}>Не загрузилось из API</div>
            <div>{loadError}</div>
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              На Render проверь: в Static Site указан <strong>VITE_API_URL</strong> (= URL бэкенда без <code>/api</code>),
              затем заново выполни <strong>Clear build cache & deploy</strong>.
            </div>
          </div>
        )}

        {/* Сетка производителей (поле brand) */}
        {browsingBrandTiles && (
            <div style={{ paddingBottom: 8 }}>
              {groupsLoading ? (
                <div className="spinner" />
              ) : brandGroups.length === 0 ? (
                <div className="empty" style={{ padding: '36px 0' }}>
                  <div className="empty-icon">🏷️</div>
                  <div className="empty-title">Нет брендов</div>
                  <p style={{ fontSize: 14 }}>Подстройте фильтры или добавьте товары через админку</p>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    className="card catalog-card-shell touch-target-min"
                    onClick={() =>
                      setAllBrowseTier({ mode: 'products_flat', producer: null, unbranded: false })}
                    style={{
                      padding: '14px',
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                      textAlign: 'left',
                      background: 'var(--bg3)',
                      border: '1px solid var(--accent)',
                      minHeight: 44,
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>📋 Все товары без выбора бренда</div>
                    <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text3)' }}>
                      Если нужен старый плоский список всего каталога
                    </div>
                  </button>
                  {brandGroups.map((g) => (
                    <div key={`${g.slug}-${g.brand ?? 'nb'}`} className="catalog-brand-pop">
                      <BrandTierCard
                        brandLabel={g.brand || ''}
                        slug={g.slug}
                        count={g.count}
                        onPick={(label, _slug) =>
                          /** Пустое имя производителя — «без бренда». */
                          setAllBrowseTier(
                            label
                              ? {
                                mode: 'products',
                                producer: label,
                                unbranded: false,
                              }
                              : {
                                mode: 'products',
                                producer: null,
                                unbranded: true,
                              },
                          )}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
        )}

        {!browsingBrandTiles && loading ? (
          <div className="spinner" />
        ) : !browsingBrandTiles &&
          products.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📦</div>
              <div className="empty-title">Нет товаров</div>
            </div>
          ) : !browsingBrandTiles ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 12,
                  width: '100%',
                }}
              >
                {products.map((p, i) => (
                  <div
                    key={String(p.id)}
                    className="catalog-grid-pop"
                    style={{
                      minWidth: 0,
                      animationDelay: `${Math.min(i, 12) * 0.03}s`,
                    }}
                  >
                    <ProductCard product={p} />
                  </div>
                ))}
              </div>
            ) : null}
      </div>
    </div>
  );
}
