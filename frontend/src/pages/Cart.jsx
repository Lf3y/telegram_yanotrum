import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart, cartLineTitle } from '../store/cart';
import { useTelegram } from '../hooks/useTelegram';
import { apiFetch } from '../lib/api';
import { formatByn } from '../lib/money';
import { Icon } from '../components/icons';
import { CouponTicket } from '../components/CouponTicket';
import { hapticImpact, hapticNotify, hapticSelection } from '../lib/haptics';
import { burstSmoke, flyToCart } from '../lib/fx';
import { playAdd, playSuccess, playTap } from '../lib/sound';

/** Праздничный залп дыма по центру экрана (для успешного заказа). */
function celebrateOrder() {
  if (typeof window === 'undefined') return;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  hapticNotify('success');
  playSuccess();
  burstSmoke(cx, cy, 2.2);
  window.setTimeout(() => burstSmoke(cx - 70, cy - 30, 1.4), 140);
  window.setTimeout(() => burstSmoke(cx + 70, cy - 10, 1.4), 260);
}

/** Скидка купона на клиенте (превью; сервер пересчитает сам). */
function couponPreviewDiscount(coupon, base) {
  if (!coupon) return 0;
  const type = String(coupon.type);
  const value = Number(coupon.value) || 0;
  if (type === 'percent') return Math.max(0, base * value / 100);
  if (type === 'fixed') return Math.max(0, Math.min(value, base));
  return 0;
}

/**
 * Шторка выбора купона из инвентаря.
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   coupons: Record<string, unknown>[],
 *   appliedId: number | null,
 *   onPick: (coupon: Record<string, unknown> | null) => void,
 * }} props
 */
function CouponSheet({ open, onClose, coupons, appliedId, onPick }) {
  if (!open) return null;
  const usable = coupons.filter((c) => c.usable);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">Инвентарь · купоны</div>
          <button type="button" className="sheet-close touch-target-min" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className="sheet-body">
          {usable.length === 0 ? (
            <div className="empty" style={{ padding: '24px 0' }}>
              <div className="empty-icon"><Icon name="sparkles" size="xl" /></div>
              <div className="empty-title">Нет доступных купонов</div>
              <p style={{ fontSize: 13 }}>
                Приглашайте друзей в профиле — за каждую их первую покупку вы получите купон −5%
              </p>
            </div>
          ) : (
            <div className="inventory-list">
              {usable.map((c) => {
                const applied = Number(c.id) === appliedId;
                return (
                  <CouponTicket
                    key={String(c.id)}
                    coupon={c}
                    applied={applied}
                    onApply={() => {
                      onPick(applied ? null : c);
                      hapticSelection();
                      onClose();
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Cart() {
  const { cart, dispatch } = useCart();
  const { user } = useTelegram();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [coupons, setCoupons] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [appliedCoupon, setAppliedCoupon] = useState(/** @type {Record<string, unknown> | null} */ (null));
  const [levelPercent, setLevelPercent] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  /** Без юзернейма продавец не сможет связаться — заказ оформить нельзя. */
  const hasUsername = Boolean(String(user.username || '').replace(/^@/, '').trim());

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const totals = useMemo(() => {
    const levelDiscount = subtotal * levelPercent / 100;
    const couponDiscount = couponPreviewDiscount(appliedCoupon, subtotal - levelDiscount);
    const discountTotal = Math.min(subtotal, levelDiscount + couponDiscount);
    return {
      levelDiscount,
      couponDiscount,
      discountTotal,
      total: Math.max(0, subtotal - discountTotal),
    };
  }, [subtotal, levelPercent, appliedCoupon]);

  useEffect(() => {
    if (!cart.length) return;
    apiFetch(`/api/coupons/user/${user.id}`)
      .then((r) => r.json())
      .then((data) => setCoupons(Array.isArray(data?.coupons) ? data.coupons : []))
      .catch(() => setCoupons([]));
    apiFetch(`/api/referrals/user/${user.id}`)
      .then((r) => r.json())
      .then((data) => setLevelPercent(Number(data?.discountPercent) || 0))
      .catch(() => setLevelPercent(0));
  }, [user.id, cart.length]);

  useEffect(() => {
    if (success) celebrateOrder();
  }, [success]);

  async function placeOrder() {
    if (!cart.length) return;
    if (!hasUsername) {
      hapticNotify('error');
      alert('У вас не установлен юзернейм в Telegram — продавец не сможет с вами связаться. Добавьте его в настройках Telegram (Настройки → Имя пользователя) и вернитесь к заказу.');
      return;
    }
    hapticImpact('medium');
    setLoading(true);
    try {
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_user_id: String(user.id),
          telegram_username: user.username || null,
          telegram_first_name: user.first_name || null,
          items: cart.map((i) => ({
            product_id: i.product_id,
            qty: i.qty,
          })),
          customer_note: note || null,
          coupon_id: appliedCoupon ? Number(appliedCoupon.id) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        dispatch({ type: 'CLEAR' });
        setAppliedCoupon(null);
        setSuccess(true);
        setTimeout(() => navigate('/profile?tab=orders'), 2000);
      }
    } catch (e) {
      if (e?.code === 'USER_BLOCKED') {
        alert(e.message || 'Доступ к заказам ограничен. Свяжитесь с магазином в Telegram.');
      } else if (e?.code === 'NO_USERNAME') {
        alert(e.message || 'Установите юзернейм в настройках Telegram, чтобы продавец мог с вами связаться.');
      } else if (e?.code === 'BAD_COUPON') {
        alert(e.message || 'Купон недоступен — попробуйте другой.');
        setAppliedCoupon(null);
      } else {
        alert(e?.message || 'Ошибка при оформлении заказа');
      }
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="empty-icon"><Icon name="check" size="xl" /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Заказ оформлен!</div>
          <div style={{ color: 'var(--text2)', fontSize: 14 }}>Мы свяжемся с вами в Telegram</div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="page">
        <div className="header">
          <div className="header-title">Корзина</div>
        </div>
        <div className="empty" style={{ paddingTop: 80 }}>
          <div className="empty-icon"><Icon name="cart" size="xl" /></div>
          <div className="empty-title">Корзина пуста</div>
          <p style={{ fontSize: 14, marginBottom: 20 }}>Добавьте товары из каталога</p>
          <button className="btn btn-primary" style={{ width: 'auto', padding: '12px 24px' }}
            onClick={() => navigate('/catalog')}>
            В каталог
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="header-title">Корзина</div>
          <div className="header-sub">{cart.length} позиции</div>
        </div>
        <button onClick={() => dispatch({ type: 'CLEAR' })}
          style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600, padding: '6px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)' }}>
          Очистить
        </button>
      </div>

      {/* Items */}
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cart.map((item, i) => (
          <div key={item.product_id} className="card"
            style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
              animation: `fadeUp 0.3s ${i * 0.05}s ease both`, opacity: 0, animationFillMode: 'forwards' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {cartLineTitle(item)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                {formatByn(item.price)} × {item.qty}
              </div>
            </div>

            {/* Qty controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button type="button" onClick={() => { dispatch({ type: 'DEC', product_id: item.product_id }); hapticSelection(); playTap(); }}
                className="touch-target-min"
                style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--bg4)', color: 'var(--text)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', border: '1px solid var(--border)', flexShrink: 0 }}>
                −
              </button>
              <span style={{ fontSize: 16, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
              <button
                type="button"
                disabled={(() => {
                  const cap = Number(item.stock_qty);
                  if (cap < 0 || !Number.isFinite(cap)) return false;
                  return item.qty >= cap;
                })()}
                onClick={(ev) => {
                  dispatch({ type: 'ADD', item });
                  hapticImpact('light');
                  playAdd();
                  flyToCart(ev.currentTarget);
                }}
                className="touch-target-min"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'var(--accent)',
                  color: 'white',
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  touchAction: 'manipulation',
                  flexShrink: 0,
                  opacity: (Number(item.stock_qty) >= 0 && Number.isFinite(Number(item.stock_qty)) && item.qty >= Number(item.stock_qty))
                    ? 0.38
                    : 1,
                }}
              >
                +
              </button>
            </div>

            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
              {formatByn(item.price * item.qty)}
            </div>
          </div>
        ))}
      </div>

      {/* Coupon */}
      <div style={{ padding: '16px 20px 0' }}>
        <button
          type="button"
          className={`cart-coupon-btn touch-target-min${appliedCoupon ? ' is-applied' : ''}`}
          onClick={() => setSheetOpen(true)}
        >
          <span className="cart-coupon-btn-icon" aria-hidden="true">🎟</span>
          <span className="cart-coupon-btn-label">
            {appliedCoupon
              ? `Купон: ${String(appliedCoupon.title)}`
              : 'Применить купон из инвентаря'}
          </span>
          <span className="cart-coupon-btn-arrow" aria-hidden="true">›</span>
        </button>
        {appliedCoupon && (
          <button
            type="button"
            className="cart-coupon-remove touch-target-min"
            onClick={() => { setAppliedCoupon(null); hapticSelection(); }}
          >
            Убрать купон
          </button>
        )}
      </div>

      {/* Note */}
      <div style={{ padding: '16px 20px 0' }}>
        <textarea
          className="cart-note"
          placeholder="Комментарий к заказу (необязательно)..."
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      </div>

      {/* Summary */}
      <div style={{ padding: '16px 20px 0' }}>
        <div className="cart-summary">
          <div className="cart-summary-glow" aria-hidden="true" />
          <div className="cart-summary-inner">
            {cart.map(item => (
              <div key={item.product_id} className="cart-summary-line">
                <span>{cartLineTitle(item)} × {item.qty}</span>
                <span>{formatByn(item.price * item.qty)}</span>
              </div>
            ))}

            {(totals.discountTotal > 0 || appliedCoupon) && (
              <>
                <div className="cart-summary-divider" />
                <div className="cart-summary-line">
                  <span>Подытог</span>
                  <span>{formatByn(subtotal)}</span>
                </div>
                {totals.levelDiscount > 0 && (
                  <div className="cart-summary-line cart-summary-line--discount">
                    <span>Скидка уровня (−{levelPercent}%)</span>
                    <span>−{formatByn(totals.levelDiscount)}</span>
                  </div>
                )}
                {appliedCoupon && String(appliedCoupon.type) !== 'free_item' && (
                  <div className="cart-summary-line cart-summary-line--discount">
                    <span>Купон: {String(appliedCoupon.title)}</span>
                    <span>−{formatByn(totals.couponDiscount)}</span>
                  </div>
                )}
                {appliedCoupon && String(appliedCoupon.type) === 'free_item' && (
                  <div className="cart-summary-line cart-summary-line--discount">
                    <span>🎁 {String(appliedCoupon.title)}</span>
                    <span>подарок</span>
                  </div>
                )}
              </>
            )}

            <div className="cart-summary-divider" />
            <div className="cart-summary-total">
              <span>Итого</span>
              <span className="cart-summary-total-value">{formatByn(totals.total)}</span>
            </div>
          </div>
        </div>

        {!hasUsername && (
          <div className="cart-username-warning">
            <span className="cart-username-warning-icon" aria-hidden="true">⚠️</span>
            <div>
              <strong>Нельзя оформить заказ: нет юзернейма в Telegram.</strong>
              <br />
              Продавец не сможет с вами связаться. Откройте Telegram → Настройки →
              «Имя пользователя», задайте юзернейм и вернитесь сюда.
            </div>
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={placeOrder}
          disabled={loading || !hasUsername}
          style={!hasUsername ? { opacity: 0.5 } : undefined}
        >
          {loading ? 'Оформляем...' : `Оформить заказ · ${formatByn(totals.total)}`}
        </button>
      </div>

      <CouponSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        coupons={coupons}
        appliedId={appliedCoupon ? Number(appliedCoupon.id) : null}
        onPick={setAppliedCoupon}
      />
    </div>
  );
}
