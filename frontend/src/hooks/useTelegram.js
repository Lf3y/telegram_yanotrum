import { useEffect } from 'react';

/**
 * Связка с Telegram Mini App: разворот экрана, CSS высот вьюпорта.
 */
export function useTelegram() {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

  useEffect(() => {
    tg?.expand?.();
    try {
      tg?.ready?.();
    } catch {
      /** ignore */
    }

    const root = document.documentElement;

    /** Стабильная высота и safe-area — обновляем при изменении viewport (Telegram Mini App). */
    const applyViewportVars = () => {
      const vStable = tg?.viewportStableHeight;
      if (typeof vStable === 'number' && vStable > 0) {
        root.style.setProperty('--viewport-stable-height', `${vStable}px`);
      }
      const sw = tg?.safeAreaInset?.bottom ?? 0;
      if (typeof sw === 'number' && sw >= 0) {
        root.style.setProperty('--safe-bottom', `${sw}px`);
      }
    };

    applyViewportVars();
    tg?.onEvent?.('viewportChanged', applyViewportVars);

    return () => {
      tg?.offEvent?.('viewportChanged', applyViewportVars);
    };
  }, [tg]);

  const user =
    tg?.initDataUnsafe?.user || {
      id: 'test_user_123',
      username: 'testuser',
      first_name: 'Test',
    };

  return {
    tg,
    user,
    isInTelegram: !!tg?.initData,
  };
}
