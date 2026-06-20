import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import AmbientSmoke from './AmbientSmoke';
import FxLayer from './FxLayer';

/** Оболочка страниц с анимацией смены вкладок и фиксированным меню. */
export default function AppLayout() {
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <AmbientSmoke className="ambient-smoke--app" opacity={0.5} />
      <main key={pathname} className="page-stage">
        <Outlet />
      </main>
      <BottomNav />
      <FxLayer />
    </div>
  );
}
