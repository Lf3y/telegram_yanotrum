import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../store/cart';

const NAV = [
  { to: '/', match: (p) => p === '/', label: 'Главная', icon: 'home' },
  { to: '/catalog', match: (p) => p.startsWith('/catalog'), label: 'Каталог', icon: 'grid' },
  { to: '/favorites', match: (p) => p === '/favorites', label: 'Избр.', icon: 'heart' },
  { to: '/cart', match: (p) => p === '/cart', label: 'Корзина', icon: 'cart' },
  { to: '/orders', match: (p) => p === '/orders', label: 'Заказы', icon: 'orders' },
];

function NavIcon({ name }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    case 'heart':
      return (
        <svg {...common}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case 'cart':
      return (
        <svg {...common}>
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      );
    case 'orders':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    default:
      return null;
  }
}

export default function BottomNav() {
  const { pathname } = useLocation();
  const { cart } = useCart();
  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const activeIndex = Math.max(0, NAV.findIndex((item) => item.match(pathname)));

  return (
    <nav className="bottom-nav">
      <div
        className="bottom-nav-glow"
        style={{ '--nav-index': activeIndex }}
        aria-hidden="true"
      />
      <div
        className="bottom-nav-indicator"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
        aria-hidden="true"
      />
      {NAV.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`bottom-nav-link${active ? ' active' : ''}`}
          >
            <span className="bottom-nav-icon-wrap">
              {item.icon === 'cart' && totalQty > 0 && (
                <span className="cart-badge">{totalQty}</span>
              )}
              <NavIcon name={item.icon} />
            </span>
            <span className="bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
