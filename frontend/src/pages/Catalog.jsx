import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../store/cart';
import { apiFetch } from '../lib/api';
import { formatByn } from '../lib/money';

function ProductCard({ product, onAdd, added }) {
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {product.image_url && (
        <div style={{ height: 96, borderRadius: 12, overflow: 'hidden', background: 'var(--bg4)', border: '1px solid var(--border)' }}>
          <img
            src={product.image_url}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
            {product.brand}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 }}>
            {product.name}
          </div>
          {product.description && (
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>{product.description}</div>
          )}
        </div>
      </div>

      {/* Tags */}
      {(product.volume || product.nicotine) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {product.volume && (
            <span className="badge badge-accent" style={{ fontSize: 11 }}>{product.volume}</span>
          )}
          {product.nicotine && (
            <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text2)', fontSize: 11 }}>{product.nicotine}</span>
          )}
        </div>
      )}

      {/* Price + Add */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800 }}>
            {formatByn(product.price)}
          </span>
          {product.old_price && (
            <span style={{ fontSize: 13, color: 'var(--text3)', textDecoration: 'line-through' }}>
              {formatByn(product.old_price)}
            </span>
          )}
        </div>
        {product.stock_qty != null && product.stock_qty >= 0 && product.stock_qty <= 15 && (
          <span style={{ fontSize: 11, color: product.stock_qty <= 3 ? 'var(--accent2)' : 'var(--text3)', fontWeight: 600 }}>
            {product.stock_qty === 0 ? 'Нет в наличии' : `Осталось ${product.stock_qty} шт.`}
          </span>
        )}
        </div>
        <button
          onClick={() => onAdd(product)}
          disabled={product.stock_qty === 0 || product.stock_qty === '0'}
          style={{
            width: 36, height: 36,
            borderRadius: 10,
            background: added ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
            color: added ? 'var(--green)' : 'white',
            fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
            flexShrink: 0,
            opacity: product.stock_qty === 0 || product.stock_qty === '0' ? 0.4 : 1,
            cursor: product.stock_qty === 0 || product.stock_qty === '0' ? 'not-allowed' : 'pointer',
          }}
        >
          {added ? '✓' : '+'}
        </button>
      </div>
    </div>
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
  const [added, setAdded] = useState({});
  const { dispatch } = useCart();
  /** Сообщение при сбое API — чаще всего не указан VITE_API_URL на Render */
  const [loadError, setLoadError] = useState('');

  const activeSlug = slug || 'all';

  useEffect(() => {
    apiFetch('/api/categories')
      .then(r => r.json())
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    // reset brand on category change
    setActiveBrand('all');

    if (activeSlug === 'all') {
      setBrands([]);
      return;
    }

    apiFetch(`/api/brands?category=${activeSlug}`)
      .then(r => r.json())
      .then(data => setBrands(Array.isArray(data) ? data : []))
      .catch(() => setBrands([]));
  }, [activeSlug]);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    const qs = new URLSearchParams();
    if (activeSlug !== 'all') qs.set('category', activeSlug);
    if (activeSlug !== 'all' && activeBrand !== 'all') qs.set('brand', activeBrand);
    const url = qs.toString() ? `/api/products?${qs.toString()}` : '/api/products';

    apiFetch(url)
      .then(r => r.json())
      .then(data => {
        setProducts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        setProducts([]);
        setLoadError(String(e.message || 'Не удалось загрузить товары'));
        setLoading(false);
      });
  }, [activeSlug, activeBrand]);

  function addToCart(product) {
    dispatch({ type: 'ADD', item: { product_id: product.id, name: product.name, price: product.price } });
    setAdded(prev => ({ ...prev, [product.id]: true }));
    setTimeout(() => setAdded(prev => ({ ...prev, [product.id]: false })), 1500);
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="header">
        <div>
          <div className="header-title">Каталог</div>
          <div className="header-sub">{products.length} товаров</div>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'flex', gap: 8, padding: '0 20px', width: 'max-content' }}>
          {[{ slug: 'all', name: 'Все', emoji: '🛍' }, ...categories].map(cat => {
            const isActive = cat.slug === activeSlug;
            return (
              <button
                key={cat.slug}
                onClick={() => navigate(cat.slug === 'all' ? '/catalog' : `/catalog/${cat.slug}`)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 99,
                  fontSize: 13,
                  fontWeight: 600,
                  background: isActive ? 'var(--accent)' : 'var(--bg3)',
                  color: isActive ? 'white' : 'var(--text2)',
                  border: isActive ? 'none' : '1px solid var(--border)',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                {cat.emoji} {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Brand tabs */}
      {activeSlug !== 'all' && (
        <div style={{ overflowX: 'auto', padding: '10px 0 0', paddingBottom: 4 }}>
          <div style={{ display: 'flex', gap: 8, padding: '0 20px', width: 'max-content' }}>
            {[{ slug: 'all', name: 'Все бренды' }, ...brands].map(b => {
              const isActive = b.slug === activeBrand;
              return (
                <button
                  key={b.slug}
                  onClick={() => setActiveBrand(b.slug)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 99,
                    fontSize: 12,
                    fontWeight: 700,
                    background: isActive ? 'rgba(var(--accent-rgb), 0.18)' : 'var(--bg3)',
                    color: isActive ? 'var(--accent2)' : 'var(--text2)',
                    border: isActive ? '1px solid rgba(var(--accent-rgb), 0.35)' : '1px solid var(--border)',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {b.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Products grid */}
      <div style={{ padding: '16px 20px 0' }}>
        {loadError && (
          <div style={{
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(255,45,45,0.08)',
            border: '1px solid rgba(255,45,45,0.25)',
            fontSize: 13,
            lineHeight: 1.45,
            color: 'var(--text2)',
          }}>
            <div style={{ fontWeight: 700, color: 'var(--accent2)', marginBottom: 6 }}>Не загрузилось из API</div>
            <div>{loadError}</div>
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              На Render проверь: в Static Site указан <strong>VITE_API_URL</strong> (= URL бэкенда без <code>/api</code>),
              затем заново выполни <strong>Clear build cache & deploy</strong>. На бэкенде совпадает <strong>FRONTEND_URL</strong> и URL витрины (CORS).
            </div>
          </div>
        )}
        {loading ? (
          <div className="spinner" />
        ) : products.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📦</div>
            <div className="empty-title">Нет товаров</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {products.map((p, i) => (
              <div key={p.id} style={{ animation: `fadeUp 0.35s ${i * 0.05}s ease both`, opacity: 0, animationFillMode: 'forwards' }}>
                <ProductCard product={p} onAdd={addToCart} added={added[p.id]} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
