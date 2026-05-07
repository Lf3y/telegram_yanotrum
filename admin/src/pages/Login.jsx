import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadAuth, saveAuth } from '../lib/auth';
import { adminFetch } from '../lib/api';

export default function Login() {
  const nav = useNavigate();
  const initial = useMemo(() => loadAuth(), []);
  const [apiBase, setApiBase] = useState(initial.apiBase || 'http://localhost:3001');
  const [token, setToken] = useState(initial.token || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      saveAuth({ apiBase, token });
      await adminFetch('/api/admin/categories');
      nav('/');
    } catch (err) {
      setError(err?.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-outer">
    <div className="login-box card" style={{ padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="title" style={{ fontSize: 20 }}>Вход в админку</div>
          <div className="muted">Токен хранится локально в браузере.</div>
        </div>
        <span className="pill">локально</span>
      </div>

      <form onSubmit={onSubmit} style={{ marginTop: 14, display: 'grid', gap: 12 }}>
        <div className="field">
          <div className="label">API Base URL</div>
          <input className="input" value={apiBase} onChange={e => setApiBase(e.target.value)} placeholder="http://localhost:3001" />
          <div className="muted">Для Render будет `https://...onrender.com`</div>
        </div>

        <div className="field">
          <div className="label">ADMIN_TOKEN</div>
          <input className="input" value={token} onChange={e => setToken(e.target.value)} placeholder="введи токен" />
          <div className="muted">Должен совпадать с env `ADMIN_TOKEN` на бэкенде.</div>
        </div>

        {error && (
          <div className="card" style={{ padding: 12, borderColor: 'rgba(255,45,45,0.35)', background: 'rgba(255,45,45,0.08)' }}>
            <div style={{ fontWeight: 800 }}>Ошибка</div>
            <div className="muted">{error}</div>
          </div>
        )}

        <button className="btn btn-primary" disabled={loading || !apiBase || !token}>
          {loading ? 'Проверяем...' : 'Войти'}
        </button>
      </form>
    </div>
    </div>
  );
}

