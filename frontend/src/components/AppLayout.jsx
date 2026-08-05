import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import AmbientSmoke from './AmbientSmoke';
import FxLayer from './FxLayer';
import LiquidBackground from './LiquidBackground';
import { useTelegram } from '../hooks/useTelegram';
import { apiFetch } from '../lib/api';

/** Оболочка страниц с анимацией смены вкладок и фиксированным меню. */
export default function AppLayout() {
  const { pathname } = useLocation();
  const { tg, user } = useTelegram();

  /** Привязка реферала, если Mini App открыт по ссылке t.me/...?startapp=ref_<id>. */
  useEffect(() => {
    const startParam = tg?.initDataUnsafe?.start_param;
    if (!startParam || !/^ref_\d+$/.test(String(startParam))) return;
    apiFetch('/api/referrals/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_user_id: String(user.id),
        start_param: String(startParam),
      }),
    }).catch(() => { /* привязка не критична для работы приложения */ });
  }, [tg, user.id]);

  return (
    <div className="app-shell">
      <LiquidBackground />
      <AmbientSmoke className="ambient-smoke--app" opacity={0.5} />
      <main key={pathname} className="page-stage">
        <Outlet />
      </main>
      <BottomNav />
      <FxLayer />
    </div>
  );
}
