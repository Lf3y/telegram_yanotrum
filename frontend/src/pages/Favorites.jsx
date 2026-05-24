import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTelegram } from '../hooks/useTelegram';
import { useCart } from '../store/cart';
import { apiFetch, resolveImageUrl } from '../lib/api';
import { formatByn } from '../lib/money';
import { Icon, ProductImage } from '../components/icons';
import { FavoriteButton } from '../components/FavoriteButton';
import { pluralRu } from '../lib/pluralRu';

/**
 * @param {{ product: Record<string, unknown> }} props
 */
function FavoriteProductCard({ product }) {
  const { dispatch, cart } = useCart();
  const navigate = useNavigate();
  const id = Number(product.id);
  const qty = cart.find((c) => c.product_id === id)?.qty || 0;

  const payload = {
    product_id: id,
    name: String(product.name || ''),
    brand: product.brand != null ? String(product.brand) : '',
    price: Number(product.price),
    stock_qty: product.stock_qty,
  };

  return (
    <article className="card catalog-card-shell catalog-product-card favorite-card">
      <div className="catalog-product-media favorite-card-media">
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
      <div className="catalog-product-badges catalog-product-badges--empty" aria-hidden="true" />
      <div className="catalog-product-footer">
        <div className="catalog-product-price-wrap">
          <span className="catalog-product-price">{formatByn(product.price)}</span>
        </div>
        <div className="favorite-card-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (qty > 0) dispatch({ type: 'DEC', product_id: id });
              else dispatch({ type: 'ADD', item: payload });
            }}
          >
            {qty > 0 ? `В корзине: ${qty}` : 'В корзину'}
          </button>
          {qty > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/cart')}>
              Оформить
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

import { useFavorites } from '../hooks/useFavorites';

export default function Favorites() {
  const { user } = useTelegram();
  const { ids } = useFavorites();
  const [products, setProducts] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    apiFetch(`/api/favorites/user/${user.id}`)
      .then((r) => r.json())
      .then((data) => {
        setProducts(Array.isArray(data.products) ? data.products : []);
        setTotal(Number(data.total) || 0);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e.message || 'Не удалось загрузить избранное'));
        setLoading(false);
      });
  }, [user.id]);

  useEffect(() => {
    setProducts((prev) => prev.filter((p) => ids.has(Number(p.id))));
    setTotal((t) => Math.min(t, ids.size));
  }, [ids]);

  return (
    <div className="page favorites-page">
      <div className="header">
        <div>
          <div className="header-title assistant-title">
            <Icon name="heart-filled" size="sm" />
            Избранное
          </div>
          <div className="header-sub">
            {total} {pluralRu(total, 'товар', 'товара', 'товаров')}
          </div>
        </div>
      </div>

      {loading && <div className="spinner" />}

      {error && (
        <div className="catalog-error-banner" style={{ margin: '0 20px' }}>{error}</div>
      )}

      {!loading && !error && products.length === 0 && (
        <div className="empty" style={{ paddingTop: 48 }}>
          <div className="empty-icon"><Icon name="heart" size="xl" /></div>
          <div className="empty-title">Пока пусто</div>
          <p style={{ fontSize: 14, color: 'var(--text3)' }}>
            Нажмите ♥ на товаре в каталоге — он появится здесь
          </p>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="catalog-product-grid" style={{ padding: '0 16px' }}>
          {products.map((p) => (
            <div key={String(p.id)} className="catalog-grid-pop" style={{ minWidth: 0 }}>
              <FavoriteProductCard product={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
