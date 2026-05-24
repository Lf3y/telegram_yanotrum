import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearAuth, loadAuth } from './lib/auth';

const NAV = [
  { to: '/', label: 'Дашборд' },
  { to: '/import', label: 'Импорт Excel' },
  { to: '/products', label: 'Товары' },
  { to: '/orders', label: 'Заказы' },
  { to: '/users', label: 'Блокировки' },
  { to: '/catalog', label: 'Витрина' },
];

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { apiBase } = loadAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">Vape Shop</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Панель администратора</div>
        <div className="sidebar-api">{apiBase}</div>
        <nav>
          {NAV.map(({ to, label }) => {
            const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`nav-link ${active ? 'active' : ''}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <button
            type="button"
            className="btn btn-danger"
            style={{ width: '100%' }}
            onClick={() => { clearAuth(); nav('/login'); }}
          >
            Выйти
          </button>
        </div>
      </aside>
      <div className="main">
        <div className="main-inner">{children}</div>
      </div>
    </div>
  );
}
