import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearAuth, loadAuth } from './lib/auth';
import { Icon } from './components/Icons';

/** Сгруппированная навигация — логичная структура разделов. */
const NAV_GROUPS = [
  {
    label: 'Обзор',
    items: [{ to: '/', label: 'Дашборд', icon: 'dashboard' }],
  },
  {
    label: 'Каталог',
    items: [
      { to: '/products', label: 'Товары', icon: 'box' },
      { to: '/catalog', label: 'Витрина', icon: 'layers' },
      { to: '/import', label: 'Импорт Excel', icon: 'upload' },
    ],
  },
  {
    label: 'Продажи',
    items: [{ to: '/orders', label: 'Заказы', icon: 'receipt' }],
  },
  {
    label: 'Клиенты',
    items: [
      { to: '/users', label: 'Блокировки', icon: 'shield' },
      { to: '/coupons', label: 'Купоны', icon: 'coin' },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

/**
 * @param {string} pathname
 * @param {string} to
 * @returns {boolean}
 */
const isActive = (pathname, to) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { apiBase } = loadAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const current = ALL_ITEMS.find((item) => isActive(pathname, item.to));
  const title = current?.label || 'Админка';

  const logout = () => {
    clearAuth();
    nav('/login');
  };

  return (
    <div className="app-shell">
      <div
        className={`sidebar-scrim ${drawerOpen ? 'is-open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar ${drawerOpen ? 'is-open' : ''}`}>
        <div className="sidebar-head">
          <div className="sidebar-mark" aria-hidden="true">VS</div>
          <div>
            <div className="sidebar-brand">Vape Shop</div>
            <div className="sidebar-brand-sub">Админ-панель</div>
          </div>
        </div>

        <div className="sidebar-api" title={apiBase}>
          <span className="sidebar-api-dot" aria-hidden="true" />
          {apiBase}
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="nav-group">
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`nav-link ${isActive(pathname, item.to) ? 'active' : ''}`}
                >
                  <span className="nav-link-icon"><Icon name={item.icon} /></span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button type="button" className="btn btn-danger nav-logout" onClick={logout}>
            <Icon name="logout" size={16} /> Выйти
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="topbar-burger"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Меню"
          >
            <Icon name={drawerOpen ? 'close' : 'menu'} size={20} />
          </button>
          <div className="topbar-title">{title}</div>
          <div className="topbar-right">
            <button type="button" className="btn btn-ghost btn-sm topbar-logout" onClick={logout}>
              <Icon name="logout" size={15} /> Выйти
            </button>
          </div>
        </header>
        <div className="main-inner">{children}</div>
      </div>
    </div>
  );
}
