export function useTelegram() {
  const tg = window.Telegram?.WebApp;

  // Expand to full screen
  tg?.expand();

  const user = tg?.initDataUnsafe?.user || {
    id: 'test_user_123',
    username: 'testuser',
    first_name: 'Test'
  };

  return {
    tg,
    user,
    isInTelegram: !!tg?.initData,
  };
}
