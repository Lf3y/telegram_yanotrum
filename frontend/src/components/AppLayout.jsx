import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';

/** Оболочка страниц с анимацией смены вкладок и фиксированным меню. */
export default function AppLayout() {
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <main key={pathname} className="page-stage">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
