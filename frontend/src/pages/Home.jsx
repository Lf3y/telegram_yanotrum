import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTelegram } from '../hooks/useTelegram';
import { useCart } from '../store/cart';
import { apiFetch } from '../lib/api';
import { formatByn } from '../lib/money';
import { Icon } from '../components/icons';
import { repeatOrderToCart } from '../lib/repeatOrder';

const STEPS = [
  {
    num: '01',
    icon: 'compass',
    title: 'Выберите в каталоге',
    text: 'Категория → бренд → вкус. Нажимайте «+», чтобы добавить в корзину.',
  },
  {
    num: '02',
    icon: 'cart',
    title: 'Оформите заказ',
    text: 'В корзине проверьте состав, добавьте комментарий и отправьте заявку.',
  },
  {
    num: '03',
    icon: 'chat',
    title: 'Ждите связи',
    text: 'Магазин напишет в Telegram — подтвердим детали, оплату и выдачу.',
  },
];

export default function Home() {
  const { user } = useTelegram();
  const { dispatch } = useCart();
  const navigate = useNavigate();
  const [lastOrder, setLastOrder] = useState(null);
  const [repeating, setRepeating] = useState(false);

  useEffect(() => {
    apiFetch(`/api/orders/user/${user.id}`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setLastOrder(list[0] || null);
      })
      .catch(() => setLastOrder(null));
  }, [user.id]);

  async function repeatLast() {
    if (!lastOrder?.id) return;
    setRepeating(true);
    try {
      const { added, skipped } = await repeatOrderToCart(lastOrder.id, user.id, dispatch);
      if (added === 0) {
        alert('Товары из прошлого заказа сейчас недоступны');
        return;
      }
      if (skipped > 0) alert('Часть позиций недоступна — в корзину добавлено то, что есть');
      navigate('/cart');
    } catch (e) {
      alert(e?.message || 'Не удалось повторить заказ');
    }
    setRepeating(false);
  }

  return (
    <div className="page home-page">
      <section className="home-hero">
        <div className="home-mesh" aria-hidden="true">
          <div className="home-orb home-orb--1" />
          <div className="home-orb home-orb--2" />
          <div className="home-orb home-orb--3" />
          <div className="home-grid" />
        </div>

        <div className="home-hero-inner">
          <p className="home-eyebrow">
            Добро пожаловать{user?.first_name ? `, ${user.first_name}` : ''}
          </p>
          <h1 className="home-title">
            <span className="home-title-line">VAPE</span>
            <span className="home-title-accent">SHOP</span>
          </h1>
        </div>
      </section>

      {lastOrder && (
        <section className="home-buy-again card">
          <div className="home-buy-again-head">
            <Icon name="repeat" size="sm" />
            <div>
              <div className="home-buy-again-title">Купить снова</div>
              <div className="home-buy-again-sub">
                Заказ #{lastOrder.id} · {formatByn(lastOrder.total)}
              </div>
            </div>
          </div>
          <ul className="home-buy-again-list">
            {(lastOrder.items || []).slice(0, 3).map((item, i) => (
              <li key={i}>{item.name || item.product_name} × {item.qty}</li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-primary home-buy-again-btn"
            disabled={repeating}
            onClick={repeatLast}
          >
            {repeating ? 'Добавляем…' : 'Повторить в корзину'}
          </button>
        </section>
      )}

      <section className="home-flow home-flow--landing">
        <div className="home-flow-head">
          <span className="home-flow-tag">Как это работает</span>
          <h2 className="home-flow-title">Три шага до заказа</h2>
        </div>

        <div className="home-steps">
          <div className="home-steps-line" aria-hidden="true" />
          {STEPS.map((step, i) => (
            <article
              key={step.num}
              className="home-step"
              style={{ animationDelay: `${0.12 + i * 0.1}s` }}
            >
              <div className="home-step-marker">
                <span className="home-step-num">{step.num}</span>
              </div>
              <div className="home-step-body">
                <span className="home-step-icon" aria-hidden="true">
                  <Icon name={step.icon} size="md" />
                </span>
                <h3 className="home-step-title">{step.title}</h3>
                <p className="home-step-text">{step.text}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="home-cta-row">
          <Link to="/catalog" className="home-cta">
            <span className="home-cta-glow" aria-hidden="true" />
            <span className="home-cta-label">Открыть каталог</span>
            <span className="home-cta-arrow" aria-hidden="true">→</span>
          </Link>
          <Link to="/favorites" className="home-cta home-cta--secondary">
            <Icon name="heart-filled" size="sm" />
            <span className="home-cta-label">Избранное</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
