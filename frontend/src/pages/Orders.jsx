import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelegram } from '../hooks/useTelegram';
import { useCart } from '../store/cart';
import { apiFetch } from '../lib/api';
import { formatByn } from '../lib/money';
import { pluralRu } from '../lib/pluralRu';
import { Icon } from '../components/icons';
import { repeatOrderToCart } from '../lib/repeatOrder';

const STATUS_LABELS = {
  new: { label: 'Новый', color: 'var(--accent2)', bg: 'rgba(var(--accent-rgb), 0.14)' },
  replied: { label: 'В работе · ответ', color: 'var(--green)', bg: 'rgba(34,197,94,0.12)' },
  processing: { label: 'Обрабатывается', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  done: { label: 'Выдан', color: 'var(--green)', bg: 'rgba(34,197,94,0.15)' },
  cancelled: { label: 'Отменён', color: 'var(--text3)', bg: 'rgba(255,45,45,0.12)' },
};

function formatDate(str) {
  const d = new Date(str);
  return d.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Orders() {
  const { user } = useTelegram();
  const { dispatch } = useCart();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [repeatingId, setRepeatingId] = useState(null);

  /**
   * Подпись позиции в заказе: новые заказы уже с «бренд · вкус» в `name`;
   * для старых позиций собираем из `brand` и `product_name`, если есть.
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

  useEffect(() => {
    setLoadError('');
    apiFetch(`/api/orders/user/${user.id}`)
      .then(r => r.json())
      .then(data => {
        setOrders(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        setOrders([]);
        setLoadError(String(e.message || 'Не удалось загрузить заказы'));
        setLoading(false);
      });
  }, [user.id]);

  async function handleRepeat(orderId) {
    setRepeatingId(orderId);
    try {
      const { added, skipped, partial } = await repeatOrderToCart(orderId, user.id, dispatch);
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

  if (loading) return <div className="page"><div className="spinner" /></div>;

  if (loadError) {
    return (
      <div className="page">
        <div className="header"><div className="header-title">Мои заказы</div></div>
        <div style={{ padding: '20px', fontSize: 14, color: 'var(--text2)' }}>{loadError}</div>
      </div>
    );
  }
  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="header-title">Мои заказы</div>
          <div className="header-sub">
            {orders.length} {pluralRu(orders.length, 'заказ', 'заказа', 'заказов')}
          </div>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="empty" style={{ paddingTop: 60 }}>
          <div className="empty-icon"><Icon name="clipboard" size="xl" /></div>
          <div className="empty-title">Заказов ещё нет</div>
          <p style={{ fontSize: 14 }}>Ваши заказы появятся здесь</p>
        </div>
      ) : (
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map((order, i) => {
            const status = STATUS_LABELS[order.status] || STATUS_LABELS.new;
            const isOpen = expanded === order.id;
            return (
              <div key={order.id} className="card"
                style={{ overflow: 'hidden', animation: `fadeUp 0.35s ${i * 0.06}s ease both`, opacity: 0, animationFillMode: 'forwards' }}>
                {/* Order header */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : order.id)}
                  style={{
                    width: '100%',
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    color: 'var(--text)',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>Заказ #{order.id}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{formatDate(order.created_at)}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
                      {formatByn(order.total)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{isOpen ? '▲' : '▼'}</div>
                  </div>
                </button>

                {/* Expanded details */}
                {isOpen && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)', animation: 'fadeIn 0.2s ease' }}>
                    <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Items */}
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Товары</div>
                      {order.items.map((item, j) => (
                        <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, minWidth: 0 }}>
                          <span style={{ color: 'var(--text2)', overflowWrap: 'anywhere' }}>{orderLineLabel(item)} × {item.qty}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>{formatByn(item.price * item.qty)}</span>
                        </div>
                      ))}

                      {order.customer_note && (
                        <div className="order-note">
                          <Icon name="note" size="xs" /> {order.customer_note}
                        </div>
                      )}

                      {order.owner_note && (
                        <div style={{ marginTop: 8, padding: '12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8 }}>
                          <div className="order-reply-label">
                            <Icon name="chat" size="xs" /> Ответ магазина
                          </div>
                          <div style={{ fontSize: 14, color: 'var(--text)' }}>{order.owner_note}</div>
                        </div>
                      )}

                      <button
                        type="button"
                        className="btn btn-primary order-repeat-btn"
                        disabled={repeatingId === order.id}
                        onClick={() => handleRepeat(order.id)}
                      >
                        <Icon name="repeat" size="xs" />
                        {repeatingId === order.id ? 'Добавляем…' : 'Повторить заказ'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
