import { formatByn } from '../lib/money';

/** @param {Record<string, unknown>} coupon */
export function couponValueLabel(coupon) {
  const type = String(coupon.type);
  if (type === 'percent') return `−${Number(coupon.value)}%`;
  if (type === 'fixed') return `−${formatByn(coupon.value)}`;
  return '🎁';
}

/** @param {string | null | undefined} raw */
function formatExpiry(raw) {
  if (!raw) return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Купон-«билетик» с отрывным краем.
 * @param {{
 *   coupon: Record<string, unknown>,
 *   muted?: boolean,
 *   onApply?: () => void,
 *   applied?: boolean,
 * }} props
 */
export function CouponTicket({ coupon, muted = false, onApply, applied = false }) {
  const expiry = formatExpiry(coupon.expires_at);
  const usesLeft = Number(coupon.uses_left);
  const isGift = String(coupon.type) === 'free_item';

  return (
    <div className={`coupon-ticket${muted ? ' coupon-ticket--muted' : ''}${isGift ? ' coupon-ticket--gift' : ''}${applied ? ' coupon-ticket--applied' : ''}`}>
      <div className="coupon-ticket-value">{couponValueLabel(coupon)}</div>
      <div className="coupon-ticket-main">
        <div className="coupon-ticket-title">{String(coupon.title)}</div>
        {coupon.description && (
          <div className="coupon-ticket-desc">{String(coupon.description)}</div>
        )}
        <div className="coupon-ticket-meta">
          {coupon.is_event && <span className="coupon-ticket-tag">Ивент</span>}
          {Number.isFinite(usesLeft) && usesLeft > 0 && usesLeft < 99 && (
            <span>Осталось: {usesLeft}</span>
          )}
          {expiry && <span>До {expiry}</span>}
          {muted && <span>{coupon.expired ? 'Истёк' : 'Использован'}</span>}
        </div>
      </div>
      {onApply && (
        <button
          type="button"
          className={`coupon-apply-btn touch-target-min${applied ? ' is-applied' : ''}`}
          onClick={onApply}
        >
          {applied ? '✓' : 'Применить'}
        </button>
      )}
    </div>
  );
}
