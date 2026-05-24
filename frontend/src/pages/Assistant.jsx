import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, resolveImageUrl } from '../lib/api';
import { formatByn } from '../lib/money';
import { useCart } from '../store/cart';
import { Icon, ProductImage } from '../components/icons';

const QUICK_PROMPTS = [
  'Сладкий фруктовый вкус с лёгким холодком',
  'Кислые ягоды, без табака',
  'Нейтральный, не слишком крепкий',
  'Что-то новое и необычное',
  'Десертный вкус, как печенье или ваниль',
];

export default function Assistant() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [intro, setIntro] = useState('');
  const [items, setItems] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const { dispatch } = useCart();
  const navigate = useNavigate();

  async function runAdvise(text) {
    const q = String(text || query).trim();
    if (q.length < 3) {
      setError('Опишите, что ищете — хотя бы пару слов');
      return;
    }
    setLoading(true);
    setError('');
    setIntro('');
    setItems([]);
    try {
      const res = await apiFetch('/api/ai/advise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      setIntro(String(data.intro || ''));
      setItems(Array.isArray(data.products) ? data.products : []);
      if (!data.products?.length) {
        setError('Не нашлось подходящих товаров — попробуйте переформулировать');
      }
    } catch (e) {
      setError(e?.message || 'Не удалось получить рекомендации');
    }
    setLoading(false);
  }

  function addToCart(product) {
    dispatch({
      type: 'ADD',
      item: {
        product_id: Number(product.id),
        name: String(product.name || ''),
        brand: product.brand != null ? String(product.brand) : '',
        price: Number(product.price),
        stock_qty: product.stock_qty,
      },
    });
  }

  return (
    <div className="page assistant-page">
      <div className="header">
        <div>
          <div className="header-title assistant-title">
            <Icon name="sparkles" size="sm" />
            Подбор вкуса
          </div>
          <div className="header-sub">AI-консультант по нашему каталогу</div>
        </div>
      </div>

      <div className="assistant-body">
        <p className="assistant-lead">
          Расскажите, что нравится — сладкое, кислое, холодок, крепость — и получите подборку из реальных товаров магазина.
        </p>

        <div className="assistant-chips">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              className="assistant-chip"
              onClick={() => {
                setQuery(p);
                runAdvise(p);
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <textarea
          className="assistant-input"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          placeholder="Например: хочу что-то ягодное, не очень сладкое, 3 мг"
          rows={3}
        />

        <button
          type="button"
          className="btn btn-primary assistant-submit"
          disabled={loading}
          onClick={() => runAdvise(query)}
        >
          {loading ? 'Думаю…' : 'Подобрать'}
        </button>

        {error && <div className="catalog-error-banner">{error}</div>}

        {loading && <div className="spinner" style={{ marginTop: 24 }} />}

        {intro && !loading && (
          <div className="assistant-intro card">{intro}</div>
        )}

        {items.length > 0 && !loading && (
          <div className="assistant-results">
            {items.map((p) => (
              <article key={String(p.id)} className="card assistant-result-card">
                <div className="assistant-result-media">
                  <ProductImage
                    src={resolveImageUrl(p.image_url)}
                    alt={String(p.name || '')}
                    className="assistant-result-img"
                  />
                </div>
                <div className="assistant-result-body">
                  <div className="assistant-result-brand">{p.brand || '·'}</div>
                  <div className="assistant-result-name">{p.name}</div>
                  {p.reason && <p className="assistant-result-reason">{p.reason}</p>}
                  <div className="assistant-result-footer">
                    <span className="assistant-result-price">{formatByn(p.price)}</span>
                    <div className="assistant-result-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => addToCart(p)}>
                        В корзину
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => navigate('/cart')}>
                        Корзина
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
