import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../store/cart';

export default function BottomNav() {
  const { pathname } = useLocation();
  const { cart } = useCart();
  const totalQty = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <nav className="bottom-nav">
      <Link to="/" className={pathname === '/' ? 'active' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        Главная
      </Link>

      <Link to="/catalog" className={pathname.startsWith('/catalog') ? 'active' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
        Каталог
      </Link>

      <Link to="/favorites" className={pathname === '/favorites' ? 'active' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        Избр.
      </Link>

      <Link to="/cart" className={pathname === '/cart' ? 'active' : ''} style={{ position: 'relative' }}>
        {totalQty > 0 && <span className="cart-badge">{totalQty}</span>}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
        Корзина
      </Link>

      <Link to="/assistant" className={pathname === '/assistant' ? 'active' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.2 4.2L17.5 8.5l-4.3 1.2L12 14l-1.2-4.3L6.5 8.5l4.3-1.2L12 3z" fill="currentColor" stroke="none" />
          <path d="M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14z" fill="currentColor" stroke="none" opacity="0.7" />
        </svg>
        AI
      </Link>

      <Link to="/orders" className={pathname === '/orders' ? 'active' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
        Заказы
      </Link>
    </nav>
  );
}
