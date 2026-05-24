import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTelegram } from '../hooks/useTelegram';
import { apiFetch } from '../lib/api';

const STEPS = [
  {
    num: '01',
    icon: '🧭',
    title: 'Выберите в каталоге',
    text: 'Категория → бренд → вкус. Нажимайте «+», чтобы добавить в корзину.',
  },
  {
    num: '02',
    icon: '🛒',
    title: 'Оформите заказ',
    text: 'В корзине проверьте состав, добавьте комментарий и отправьте заявку.',
  },
  {
    num: '03',
    icon: '💬',
    title: 'Ждите связи',
    text: 'Магазин напишет в Telegram — подтвердим детали, оплату и выдачу.',
  },
];

export default function Home() {
  const { user } = useTelegram();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    setLoadError('');
    apiFetch('/api/categories')
      .then(r => r.json())
      .then(data => {
        setCategories(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        setCategories([]);
        setLoadError(String(e.message || 'Не удалось загрузить категории'));
        setLoading(false);
      });
  }, []);

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
          <p className="home-lead">
            Свежий каталог, честные цены в BYN и быстрая связь через Telegram.
          </p>
        </div>
      </section>

      <section className="home-flow">
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
                <span className="home-step-icon" aria-hidden="true">{step.icon}</span>
                <h3 className="home-step-title">{step.title}</h3>
                <p className="home-step-text">{step.text}</p>
              </div>
            </article>
          ))}
        </div>

        <Link to="/catalog" className="home-cta">
          <span className="home-cta-glow" aria-hidden="true" />
          <span className="home-cta-label">Открыть каталог</span>
          <span className="home-cta-arrow" aria-hidden="true">→</span>
        </Link>
      </section>

      <section className="home-categories">
        <h2 className="home-categories-title">Категории</h2>
        {loadError && (
          <div className="catalog-error-banner">
            {loadError}
          </div>
        )}
        {loading ? (
          <div className="spinner" />
        ) : (
          <div className="catalog-category-grid">
            {categories.map((cat, i) => (
              <Link
                key={cat.id}
                to={`/catalog/${cat.slug}`}
                className="card home-category-card"
                style={{ animationDelay: `${0.05 * i}s` }}
              >
                {cat.image_url ? (
                  <div className="home-category-media">
                    <img src={cat.image_url} alt="" loading="lazy" />
                  </div>
                ) : (
                  <div className="home-category-emoji">{cat.emoji}</div>
                )}
                <div className="home-category-info">
                  <div className="home-category-name">{cat.emoji} {cat.name}</div>
                  <div className="home-category-desc">{cat.description}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
