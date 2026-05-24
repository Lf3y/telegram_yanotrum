import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTelegram } from '../hooks/useTelegram';
import { useCart } from '../store/cart';
import { useFavorites } from '../hooks/useFavorites';
import { apiFetch, resolveImageUrl } from '../lib/api';
import { formatByn } from '../lib/money';
import { pluralRu } from '../lib/pluralRu';
import { Icon, ProductImage } from '../components/icons';
import { FavoriteButton } from '../components/FavoriteButton';
import { repeatOrderToCart } from '../lib/repeatOrder';

/** @typedef {'orders' | 'favorites'} ProfileTab */

const STATUS_LABELS = {
  new: { label: 'Новый', color: 'var(--accent2)', bg: 'rgba(var(--accent-rgb), 0.14)' },
  replied: { label: 'В работе', color: 'var(--green)', bg: 'rgba(34,197,94,0.12)' },
  processing: { label: 'Обработка', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  done: { label: 'Выдан', color: 'var(--green)', bg: 'rgba(34,197,94,0.15)' },
  cancelled: { label: 'Отменён', color: 'var(--text3)', bg: 'rgba(255,45,45,0.12)' },
};

/**
 * @param {string | undefined} str
 */
function formatDate(str) {
  const d = new Date(str);
  return d.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * @param {Record<string, unknown>} item
 */
function orderLineLabel(item) {
  const name = item?.name != null ? String(item.name).trim() : '';
  if (name.includes('·')) return name;
  const brand = item?.brand != null ? String(item.brand).trim() : '';
  const pn = item?.product_name != null ? String(item.product_name).trim() : '';
  if (brand && pn) return `${brand} · ${pn}`;
  return name || pn || 'Товар';
}

/**
 * @param {{ user: Record<string, unknown> }} props
 */
function ProfileHero({ user }) {
  const firstName = String(user.first_name || '').trim();
  const lastName = String(user.last_name || '').trim();
  const username = user.username ? String(user.username).replace(/^@/, '') : '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || username || 'Покупатель';
  const photoUrl = user.photo_url ? String(user.photo_url) : '';
  const initials = (firstName[0] || username[0] || '?').toUpperCase();

  return (
    <section className="profile-hero card">
      <div className="profile-hero-glow" aria-hidden="true" />
      <div className="profile-hero-inner">
        <div className="profile-avatar-wrap">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="profile-avatar" />
          ) : (
            <div className="profile-avatar profile-avatar--fallback">{initials}</div>
          )}
        </div>
        <div className="profile-hero-text">
          <h1 className="profile-name">{displayName}</h1>
          {username && <div className="profile-username">@{username}</div>}
          <div className="profile-id">ID {String(user.id)}</div>
        </div>
      </div>
    </section>
  );
}

/**
 * @param {{ stats: { orders: number, done: number, favorites: number } }} props
 */
function ProfileStats({ stats }) {
  const items = [
    { label: 'Заказов', value: String(stats.orders), hint: 'всего' },
    { label: 'Выдано', value: String(stats.done), hint: 'заказов' },
    { label: 'Избранное', value: String(stats.favorites), hint: pluralRu(stats.favorites, 'товар', 'товара', 'товаров') },
  ];

  return (
    <section className="profile-stats">
      {items.map((item) => (
        <article key={item.label} className="profile-stat card">
          <div className="profile-stat-value">{item.value}</div>
          <div className="profile-stat-label">{item.label}</div>
          <div className="profile-stat-hint">{item.hint}</div>
        </article>
      ))}
    </section>
  );
}

/**
 * @param {{ tab: ProfileTab, onChange: (tab: ProfileTab) => void, ordersCount: number, favoritesCount: number }} props
 */
function ProfileTabs({ tab, onChange, ordersCount, favoritesCount }) {
  return (
    <div className="profile-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'orders'}
        className={`profile-tab${tab === 'orders' ? ' profile-tab--active' : ''}`}
        onClick={() => onChange('orders')}
      >
        <Icon name="clipboard" size="xs" />
        Заказы
        {ordersCount > 0 && <span className="profile-tab-badge">{ordersCount}</span>}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'favorites'}
        className={`profile-tab${tab === 'favorites' ? ' profile-tab--active' : ''}`}
        onClick={() => onChange('favorites')}
      >
        <Icon name="heart-filled" size="xs" />
        Избранное
        {favoritesCount > 0 && <span className="profile-tab-badge">{favoritesCount}</span>}
      </button>
    </div>
  );
}

function ProfileLoungeCard() {
  return (
    <section className="profile-lounge-card card">
      <div className="profile-lounge-copy">
        <div className="profile-lounge-kicker">
          <Icon name="sparkles" size="xs" />
          2D лаунж
        </div>
        <div className="profile-lounge-title">King Lounge</div>
        <p>Заходи в общую комнату, ходи джойстиком, общайся и пускай облака.</p>
      </div>
      <Link to="/lounge" className="profile-lounge-button">
        Зайти
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

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

/**
 * @param {{
 *   orders: Record<string, unknown>[],
 *   userId: string | number,
 *   dispatch: ReturnType<typeof useCart>['dispatch'],
 *   navigate: ReturnType<typeof useNavigate>,
 * }} props
 */
function ProfileOrdersTab({ orders, userId, dispatch, navigate }) {
  const [expanded, setExpanded] = useState(null);
  const [repeatingId, setRepeatingId] = useState(null);

  async function handleRepeat(orderId) {
    setRepeatingId(orderId);
    try {
      const { added, skipped, partial } = await repeatOrderToCart(orderId, userId, dispatch);
      if (added === 0) {
        alert(skipped > 0 ? 'Ни один товар из заказа сейчас недоступен' : 'Не удалось повторить заказ');
        return;
      }
      if (partial || skipped > 0) {
        alert(`Добавлено ${added} поз. Некоторые товары недоступны или с меньшим остатком.`);
      }
      navigate('/cart');
    } catch (e) {
      alert(e?.message || 'Ошибка при повторе заказа');
    }
    setRepeatingId(null);
  }

  if (orders.length === 0) {
    return (
      <div className="empty profile-empty">
        <div className="empty-icon"><Icon name="clipboard" size="xl" /></div>
        <div className="empty-title">Заказов ещё нет</div>
        <p>Оформите первый заказ в каталоге — он появится здесь</p>
      </div>
    );
  }

  return (
    <div className="profile-orders-list">
      {orders.map((order, i) => {
        const status = STATUS_LABELS[order.status] || STATUS_LABELS.new;
        const isOpen = expanded === order.id;
        const items = Array.isArray(order.items) ? order.items : [];
        const itemCount = items.reduce((sum, it) => sum + Number(it.qty || 0), 0);

        return (
          <article
            key={String(order.id)}
            className="profile-order-card card"
            style={{ animation: `fadeUp 0.35s ${i * 0.05}s ease both`, opacity: 0, animationFillMode: 'forwards' }}
          >
            <button
              type="button"
              className="profile-order-head"
              onClick={() => setExpanded(isOpen ? null : order.id)}
            >
              <div className="profile-order-status-bar" style={{ background: status.color }} aria-hidden="true" />
              <div className="profile-order-main">
                <div className="profile-order-top">
                  <span className="profile-order-id">#{order.id}</span>
                  <span className="profile-order-status" style={{ background: status.bg, color: status.color }}>
                    {status.label}
                  </span>
                </div>
                <div className="profile-order-meta">
                  {formatDate(String(order.created_at))}
                  {' · '}
                  {itemCount} {pluralRu(itemCount, 'позиция', 'позиции', 'позиций')}
                </div>
              </div>
              <div className="profile-order-side">
                <div className="profile-order-total">{formatByn(order.total)}</div>
                <div className="profile-order-chevron">{isOpen ? '▲' : '▼'}</div>
              </div>
            </button>

            {isOpen && (
              <div className="profile-order-body">
                {items.map((item, j) => (
                  <div key={j} className="profile-order-line">
                    <span>{orderLineLabel(item)} × {item.qty}</span>
                    <span>{formatByn(Number(item.price) * Number(item.qty))}</span>
                  </div>
                ))}

                {order.customer_note && (
                  <div className="order-note">
                    <Icon name="note" size="xs" /> {String(order.customer_note)}
                  </div>
                )}

                {order.owner_note && (
                  <div className="profile-order-reply">
                    <div className="order-reply-label">
                      <Icon name="chat" size="xs" /> Ответ магазина
                    </div>
                    <div>{String(order.owner_note)}</div>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-primary order-repeat-btn"
                  disabled={repeatingId === order.id}
                  onClick={() => handleRepeat(Number(order.id))}
                >
                  <Icon name="repeat" size="xs" />
                  {repeatingId === order.id ? 'Добавляем…' : 'Повторить заказ'}
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

/**
 * @param {{ products: Record<string, unknown>[] }} props
 */
function ProfileFavoritesTab({ products }) {
  if (products.length === 0) {
    return (
      <div className="empty profile-empty">
        <div className="empty-icon"><Icon name="heart" size="xl" /></div>
        <div className="empty-title">Избранное пусто</div>
        <p>Нажмите ♥ на товаре в каталоге — он появится здесь</p>
      </div>
    );
  }

  return (
    <div className="catalog-product-grid profile-favorites-grid">
      {products.map((p) => (
        <div key={String(p.id)} className="catalog-grid-pop" style={{ minWidth: 0 }}>
          <FavoriteProductCard product={p} />
        </div>
      ))}
    </div>
  );
}

export default function Profile() {
  const { user } = useTelegram();
  const { dispatch } = useCart();
  const { ids } = useFavorites();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  /** @type {ProfileTab} */
  const tab = tabParam === 'favorites' ? 'favorites' : 'orders';

  const [orders, setOrders] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [products, setProducts] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      apiFetch(`/api/orders/user/${user.id}`).then((r) => r.json()),
      apiFetch(`/api/favorites/user/${user.id}`).then((r) => r.json()),
    ])
      .then(([ordersData, favData]) => {
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setProducts(Array.isArray(favData?.products) ? favData.products : []);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e.message || 'Не удалось загрузить профиль'));
        setLoading(false);
      });
  }, [user.id]);

  useEffect(() => {
    setProducts((prev) => prev.filter((p) => ids.has(Number(p.id))));
  }, [ids]);

  const stats = useMemo(() => {
    const done = orders.filter((o) => o.status === 'done').length;
    return {
      orders: orders.length,
      done,
      favorites: products.length,
    };
  }, [orders, products.length]);

  /** @param {ProfileTab} nextTab */
  function setTab(nextTab) {
    setSearchParams(nextTab === 'orders' ? {} : { tab: nextTab }, { replace: true });
  }

  if (loading) {
    return (
      <div className="page profile-page">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page profile-page">
      <ProfileHero user={user} />
      <ProfileStats stats={stats} />
      <ProfileLoungeCard />

      <ProfileTabs
        tab={tab}
        onChange={setTab}
        ordersCount={orders.length}
        favoritesCount={products.length}
      />

      {error && (
        <div className="catalog-error-banner profile-error">{error}</div>
      )}

      <div className="profile-tab-panel" role="tabpanel">
        {tab === 'orders' ? (
          <ProfileOrdersTab orders={orders} userId={user.id} dispatch={dispatch} navigate={navigate} />
        ) : (
          <ProfileFavoritesTab products={products} />
        )}
      </div>
    </div>
  );
}
