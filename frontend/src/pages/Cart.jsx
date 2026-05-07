import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../store/cart';
import { useTelegram } from '../hooks/useTelegram';
import { apiFetch } from '../lib/api';

export default function Cart() {
  const { cart, dispatch } = useCart();
  const { user } = useTelegram();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  async function placeOrder() {
    if (!cart.length) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_user_id: String(user.id),
          telegram_username: user.username || null,
          telegram_first_name: user.first_name || null,
          items: cart.map(i => ({ product_id: i.product_id, qty: i.qty })),
          customer_note: note || null,
        })
      });
      const data = await res.json();
      if (data.success) {
        dispatch({ type: 'CLEAR' });
        setSuccess(true);
        setTimeout(() => navigate('/orders'), 2000);
      }
    } catch (e) {
      alert(e?.message || 'Ошибка при оформлении заказа');
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
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
          <div className="empty-icon">🛒</div>
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
                {item.name}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                {item.price.toLocaleString('ru')}₽ × {item.qty}
              </div>
            </div>

            {/* Qty controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button onClick={() => dispatch({ type: 'DEC', product_id: item.product_id })}
                style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--bg4)', color: 'var(--text)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                −
              </button>
              <span style={{ fontSize: 16, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{item.qty}</span>
              <button onClick={() => dispatch({ type: 'ADD', item })}
                style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                +
              </button>
            </div>

            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
              {(item.price * item.qty).toLocaleString('ru')}₽
            </div>
          </div>
        ))}
      </div>

      {/* Note */}
      <div style={{ padding: '16px 20px 0' }}>
        <textarea
          placeholder="Комментарий к заказу (необязательно)..."
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{
            width: '100%', padding: '12px 14px',
            background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 12, color: 'var(--text)',
            fontSize: 14, resize: 'none', height: 80,
            fontFamily: 'var(--font-body)',
            outline: 'none',
          }}
        />
      </div>

      {/* Summary */}
      <div style={{ padding: '16px 20px 0' }}>
        <div className="card" style={{ padding: '16px', marginBottom: 12 }}>
          {cart.map(item => (
            <div key={item.product_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
              <span>{item.name} × {item.qty}</span>
              <span>{(item.price * item.qty).toLocaleString('ru')}₽</span>
            </div>
          ))}
          <div className="divider" style={{ margin: '10px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800 }}>
            <span>Итого</span>
            <span style={{ color: 'var(--accent2)' }}>{total.toLocaleString('ru')}₽</span>
          </div>
        </div>

        <button className="btn btn-primary" onClick={placeOrder} disabled={loading}>
          {loading ? 'Оформляем...' : `Оформить заказ · ${total.toLocaleString('ru')}₽`}
        </button>
      </div>
    </div>
  );
}
