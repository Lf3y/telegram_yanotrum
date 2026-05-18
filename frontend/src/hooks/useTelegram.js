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
    /** Стабильная высота вьюпорта — убирает «лишнее» после адрес-бара Telegram. */
    const vStable = tg?.viewportStableHeight;
    if (typeof vStable === 'number' && vStable > 0) {
      root.style.setProperty('--viewport-stable-height', `${vStable}px`);
    }

    /** Нижняя безопасная зона (вырезы / домашний индикатор). */
    const sw = tg?.safeAreaInset?.bottom ?? 0;
    if (typeof sw === 'number' && sw >= 0) {
      root.style.setProperty('--safe-bottom', `${sw}px`);
    }
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
