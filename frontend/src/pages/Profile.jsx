import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTelegram } from '../hooks/useTelegram';
import { useCart } from '../store/cart';
import { useFavorites } from '../hooks/useFavorites';
import { apiFetch, resolveImageUrl } from '../lib/api';
import { formatByn } from '../lib/money';
import { pluralRu } from '../lib/pluralRu';
import { Icon, ProductImage } from '../components/icons';
import { FavoriteButton } from '../components/FavoriteButton';
import { repeatOrderToCart } from '../lib/repeatOrder';
import { CouponTicket } from '../components/CouponTicket';
import { isSoundEnabled, setSoundEnabled } from '../lib/sound';
import { hapticSelection } from '../lib/haptics';

/** @typedef {'orders' | 'favorites' | 'inventory'} ProfileTab */

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
 * @param {{ user: Record<string, unknown>, levelName?: string, discountPercent?: number }} props
 */
function ProfileHero({ user, levelName, discountPercent }) {
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
          {levelName && (
            <div className="profile-level-chip">
              <Icon name="sparkles" size="xs" />
              {levelName}
              {discountPercent > 0 && <span> · −{discountPercent}%</span>}
            </div>
          )}
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
 * Карточка реферальной программы: ссылка, уровень, прогресс, список друзей.
 * @param {{ summary: Record<string, unknown> | null }} props
 */
function ReferralCard({ summary }) {
  const { tg } = useTelegram();
  const [copied, setCopied] = useState(false);
  const [showFriends, setShowFriends] = useState(false);

  if (!summary) return null;

  const link = summary.share_link ? String(summary.share_link) : '';
  const qualified = Number(summary.qualified) || 0;
  const invited = Number(summary.invited) || 0;
  const next = summary.nextLevel;
  const referrals = Array.isArray(summary.referrals) ? summary.referrals : [];

  const progressPct = next
    ? Math.min(100, Math.round((qualified / Number(next.need)) * 100))
    : 100;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      hapticSelection();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Скопируйте ссылку:', link);
    }
  }

  function shareLink() {
    if (!link) return;
    const text = 'Залетай в Vape Shop — жидкости, одноразки и снюс с доставкой. Открывай прямо в Telegram!';
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
    else window.open(shareUrl, '_blank');
  }

  return (
    <section className="referral-card card">
      <div className="referral-glow" aria-hidden="true" />
      <div className="referral-inner">
        <div className="referral-kicker">
          <Icon name="sparkles" size="xs" />
          Реферальная программа
        </div>
        <h2 className="referral-title">Зови друзей — получай скидки</h2>
        <p className="referral-sub">
          Друг делает первую покупку → тебе купон −5% и прогресс уровня.
          Уровень даёт постоянную скидку на все заказы, а за каждые 10 друзей — банка жижи в подарок.
        </p>

        <div className="referral-progress">
          <div className="referral-progress-head">
            <span>Уровень «{String(summary.levelName)}»{Number(summary.discountPercent) > 0 ? ` · скидка ${summary.discountPercent}%` : ''}</span>
            {next && <span>{qualified}/{String(next.need)}</span>}
          </div>
          <div className="referral-progress-bar">
            <div className="referral-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          {next ? (
            <div className="referral-progress-hint">
              До «{String(next.name)}» (−{String(next.discount)}%) осталось {Number(next.need) - qualified}{' '}
              {pluralRu(Number(next.need) - qualified, 'друг', 'друга', 'друзей')} с покупкой
            </div>
          ) : (
            <div className="referral-progress-hint">
              Максимальный уровень — вы легенда! 👑 До следующей банки жижи в подарок:{' '}
              {Number(summary.nextGiftIn) || 10} {pluralRu(Number(summary.nextGiftIn) || 10, 'друг', 'друга', 'друзей')}
            </div>
          )}
        </div>

        {link ? (
          <div className="referral-actions">
            <button type="button" className="btn btn-primary referral-share-btn" onClick={shareLink}>
              Пригласить друга
            </button>
            <button type="button" className="referral-copy-btn touch-target-min" onClick={copyLink}>
              {copied ? '✓ Скопировано' : 'Скопировать ссылку'}
            </button>
          </div>
        ) : (
          <div className="referral-progress-hint">Ссылка-приглашение появится, когда бот будет запущен.</div>
        )}

        {invited > 0 && (
          <button
            type="button"
            className="referral-friends-toggle touch-target-min"
            onClick={() => setShowFriends((v) => !v)}
          >
            Мои друзья: {invited} ({qualified} с покупкой) {showFriends ? '▲' : '▼'}
          </button>
        )}

        {showFriends && referrals.length > 0 && (
          <div className="referral-friends">
            {referrals.map((r, i) => (
              <div key={i} className="referral-friend">
                <span className="referral-friend-name">{String(r.name)}</span>
                <span className={`referral-friend-status${r.qualified ? ' is-ok' : ''}`}>
                  {r.qualified
                    ? `${r.orders_count} ${pluralRu(Number(r.orders_count), 'покупка', 'покупки', 'покупок')}`
                    : 'ещё без покупки'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Шторка «Как это работает» — правила инвентаря, купонов и уровней. */
function InventoryInfoSheet({ open, onClose, levels }) {
  if (!open) return null;

  const lvls = Array.isArray(levels) && levels.length > 0
    ? levels
    : [
      { level: 1, need: 1, discount: 1, name: 'Искра' },
      { level: 2, need: 3, discount: 2, name: 'Дым' },
      { level: 3, need: 5, discount: 3, name: 'Туман' },
      { level: 4, need: 10, discount: 5, name: 'Легенда' },
    ];

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">Как это работает</div>
          <button type="button" className="sheet-close touch-target-min" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className="sheet-body">
          <div className="info-block">
            <div className="info-block-title">🎟 Купоны</div>
            <p>
              Купоны лежат в инвентаре. При оформлении заказа в корзине нажмите
              «Применить купон» и выберите нужный — скидка сразу отразится в итоге.
              На один заказ можно применить один купон. Если заказ отменят, купон вернётся.
            </p>
          </div>
          <div className="info-block">
            <div className="info-block-title">🎁 Купон-подарок</div>
            <p>
              Купон «Банка жижи в подарок» не меняет сумму заказа — просто примените его,
              и магазин положит подарок к вашему заказу при выдаче.
            </p>
          </div>
          <div className="info-block">
            <div className="info-block-title">🤝 Рефералы</div>
            <p>
              Отправьте другу свою ссылку из профиля. Когда друг сделает первую покупку
              (заказ выдан) — вам придёт купон −5% и вырастет прогресс уровня.
            </p>
          </div>
          <div className="info-block">
            <div className="info-block-title">⬆️ Уровни и постоянная скидка</div>
            <p>Уровень зависит от числа друзей с покупками и даёт скидку на все ваши заказы автоматически:</p>
            <ul className="info-levels">
              {lvls.filter((l) => Number(l.need) > 0).map((l) => (
                <li key={String(l.level)}>
                  <strong>{String(l.name)}</strong> — {String(l.need)}{' '}
                  {pluralRu(Number(l.need), 'друг', 'друга', 'друзей')} → скидка {String(l.discount)}%
                </li>
              ))}
            </ul>
            <p>За каждые 10 друзей с покупками — <strong>банка жижи в подарок</strong>: и за 10, и за 20, и за 30, без ограничений.</p>
          </div>
          <div className="info-block">
            <div className="info-block-title">⚡ Ивенты</div>
            <p>
              Иногда магазин раздаёт купоны всем клиентам на ограниченный срок —
              следите за инвентарём, они появляются здесь сами.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Вкладка «Инвентарь»: купоны + инфо.
 * @param {{ coupons: Record<string, unknown>[], levels: unknown[] }} props
 */
function ProfileInventoryTab({ coupons, levels }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const usable = coupons.filter((c) => c.usable);
  const rest = coupons.filter((c) => !c.usable);

  return (
    <div className="inventory-tab">
      <button type="button" className="inventory-info-btn touch-target-min" onClick={() => setInfoOpen(true)}>
        <Icon name="chat" size="xs" />
        Как использовать купоны и получать новые?
      </button>

      {coupons.length === 0 ? (
        <div className="empty profile-empty">
          <div className="empty-icon"><Icon name="sparkles" size="xl" /></div>
          <div className="empty-title">Инвентарь пуст</div>
          <p>Приглашайте друзей по ссылке выше — за каждую их первую покупку вы получите купон</p>
        </div>
      ) : (
        <>
          {usable.length > 0 && (
            <div className="inventory-list">
              {usable.map((c) => (
                <CouponTicket key={String(c.id)} coupon={c} />
              ))}
            </div>
          )}
          {rest.length > 0 && (
            <>
              <div className="inventory-section-label">Использованные и истёкшие</div>
              <div className="inventory-list inventory-list--dim">
                {rest.map((c) => (
                  <CouponTicket key={String(c.id)} coupon={c} muted />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <InventoryInfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} levels={levels} />
    </div>
  );
}

/**
 * @param {{ tab: ProfileTab, onChange: (tab: ProfileTab) => void, ordersCount: number, favoritesCount: number, couponsCount: number }} props
 */
function ProfileTabs({ tab, onChange, ordersCount, favoritesCount, couponsCount }) {
  const tabs = [
    { id: 'orders', label: 'Заказы', icon: 'clipboard', badge: ordersCount },
    { id: 'favorites', label: 'Избранное', icon: 'heart-filled', badge: favoritesCount },
    { id: 'inventory', label: 'Инвентарь', icon: 'sparkles', badge: couponsCount },
  ];

  return (
    <div className="profile-tabs profile-tabs--three" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          className={`profile-tab${tab === t.id ? ' profile-tab--active' : ''}`}
          onClick={() => onChange(/** @type {ProfileTab} */ (t.id))}
        >
          <Icon name={t.icon} size="xs" />
          {t.label}
          {t.badge > 0 && <span className="profile-tab-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Карточка настроек профиля (звук интерфейса). */
function ProfileSettingsCard() {
  const [sound, setSound] = useState(isSoundEnabled);

  const toggle = () => {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
    hapticSelection();
  };

  return (
    <section className="profile-settings card">
      <button
        type="button"
        className="profile-setting-row"
        onClick={toggle}
        aria-pressed={sound}
      >
        <span className="profile-setting-info">
          <Icon name="sparkles" size="sm" />
          <span>
            <span className="profile-setting-title">Звуки интерфейса</span>
            <span className="profile-setting-sub">{sound ? 'Включены' : 'Выключены'}</span>
          </span>
        </span>
        <span className={`profile-switch${sound ? ' is-on' : ''}`} aria-hidden="true">
          <span className="profile-switch-knob" />
        </span>
      </button>
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
        const discount = Number(order.discount_total) || 0;

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

                {discount > 0 && (
                  <div className="profile-order-line profile-order-line--discount">
                    <span>
                      Скидка{order.coupon_title ? ` (${String(order.coupon_title)})` : ''}
                    </span>
                    <span>−{formatByn(discount)}</span>
                  </div>
                )}
                {order.coupon_title && discount === 0 && (
                  <div className="profile-order-line profile-order-line--discount">
                    <span>🎁 {String(order.coupon_title)}</span>
                    <span />
                  </div>
                )}

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
  const tab = tabParam === 'favorites' ? 'favorites' : tabParam === 'inventory' ? 'inventory' : 'orders';

  const [orders, setOrders] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [products, setProducts] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [referrals, setReferrals] = useState(/** @type {Record<string, unknown> | null} */ (null));
  const [coupons, setCoupons] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      apiFetch(`/api/orders/user/${user.id}`).then((r) => r.json()),
      apiFetch(`/api/favorites/user/${user.id}`).then((r) => r.json()),
      apiFetch(`/api/referrals/user/${user.id}`).then((r) => r.json()).catch(() => null),
      apiFetch(`/api/coupons/user/${user.id}`).then((r) => r.json()).catch(() => null),
    ])
      .then(([ordersData, favData, refData, couponData]) => {
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setProducts(Array.isArray(favData?.products) ? favData.products : []);
        setReferrals(refData && typeof refData === 'object' ? refData : null);
        setCoupons(Array.isArray(couponData?.coupons) ? couponData.coupons : []);
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

  const usableCoupons = useMemo(() => coupons.filter((c) => c.usable).length, [coupons]);

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
      <ProfileHero
        user={user}
        levelName={referrals ? String(referrals.levelName) : null}
        discountPercent={referrals ? Number(referrals.discountPercent) || 0 : 0}
      />
      <ProfileStats stats={stats} />
      <ReferralCard summary={referrals} />
      <ProfileSettingsCard />

      <ProfileTabs
        tab={tab}
        onChange={setTab}
        ordersCount={orders.length}
        favoritesCount={products.length}
        couponsCount={usableCoupons}
      />

      {error && (
        <div className="catalog-error-banner profile-error">{error}</div>
      )}

      <div className="profile-tab-panel" role="tabpanel">
        {tab === 'orders' && (
          <ProfileOrdersTab orders={orders} userId={user.id} dispatch={dispatch} navigate={navigate} />
        )}
        {tab === 'favorites' && <ProfileFavoritesTab products={products} />}
        {tab === 'inventory' && (
          <ProfileInventoryTab coupons={coupons} levels={referrals?.levels} />
        )}
      </div>
    </div>
  );
}
