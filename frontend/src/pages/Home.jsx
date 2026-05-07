import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTelegram } from '../hooks/useTelegram';
import { apiFetch } from '../lib/api';

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
    <div className="page">
      {/* Hero */}
      <div style={{ padding: '24px 20px 0', animation: 'fadeUp 0.5s ease both' }}>
        <div style={{ marginBottom: 6, fontSize: 13, color: 'var(--text3)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Добро пожаловать{user?.first_name ? `, ${user.first_name}` : ''}
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.1, marginBottom: 8 }}>
          VAPE<br />
          <span style={{ color: 'var(--accent2)' }}>SHOP</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.5 }}>
          Лучшие жидкости и одноразки<br/>с доставкой по городу
        </p>
      </div>

      {/* Banner */}
      <div style={{ margin: '20px 20px 0', animation: 'fadeUp 0.5s 0.1s ease both', opacity: 0, animationFillMode: 'forwards' }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.22) 0%, #120607 55%, #0a0a0b 100%)',
          border: '1px solid rgba(var(--accent-rgb), 0.35)',
          borderRadius: 'var(--radius)',
          padding: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', right: -10, top: -10, fontSize: 80, opacity: 0.15 }}>⚡</div>
          <div style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>🔥 Горячее предложение</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Одноразки от 1100₽</div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>До 9000 затяжек · Бесплатная доставка</div>
          <Link to="/catalog/disposable" style={{ display: 'inline-flex', marginTop: 14, padding: '8px 16px', background: 'var(--accent)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'white' }}>
            Смотреть →
          </Link>
        </div>
      </div>

      {/* Categories */}
      <div style={{ padding: '24px 20px 0', animation: 'fadeUp 0.5s 0.2s ease both', opacity: 0, animationFillMode: 'forwards' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginBottom: 14 }}>Категории</div>
        {loadError && (
          <div style={{
            marginBottom: 12,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(255,45,45,0.08)',
            border: '1px solid rgba(255,45,45,0.25)',
            fontSize: 13,
            color: 'var(--text2)',
          }}>
            {loadError}
          </div>
        )}
        {loading ? (
          <div className="spinner" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {categories.map((cat, i) => (
              <Link key={cat.id} to={`/catalog/${cat.slug}`}
                className="card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  animation: `fadeUp 0.4s ${0.1 * i}s ease both`,
                  opacity: 0,
                  animationFillMode: 'forwards',
                }}
              >
                {cat.image_url ? (
                  <div style={{ height: 96, background: 'var(--bg4)' }}>
                    <img src={cat.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  </div>
                ) : (
                  <div style={{ height: 72, background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.15) 0%, var(--bg4) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>
                    {cat.emoji}
                  </div>
                )}
                <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>{cat.emoji} {cat.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.4 }}>{cat.description}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
