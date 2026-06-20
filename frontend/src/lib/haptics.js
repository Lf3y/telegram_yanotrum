/**
 * Тактильная отдача Telegram Mini App.
 * Все функции — безопасные no-op, если приложение открыто вне Telegram
 * или устройство не поддерживает вибро-отклик.
 */

/**
 * Возвращает Haptic API Telegram, если он доступен.
 * @returns {{ impactOccurred?: Function, notificationOccurred?: Function, selectionChanged?: Function } | null}
 */
const getHaptic = () => {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp?.HapticFeedback || null;
};

/**
 * Отклик при касании/нажатии.
 * @param {'light'|'medium'|'heavy'|'rigid'|'soft'} [style]
 * @returns {void}
 */
export const hapticImpact = (style = 'light') => {
  try {
    getHaptic()?.impactOccurred?.(style);
  } catch {
    /* отклик недоступен — игнорируем */
  }
};

/**
 * Уведомляющий отклик (успех/ошибка/предупреждение).
 * @param {'success'|'error'|'warning'} [type]
 * @returns {void}
 */
export const hapticNotify = (type = 'success') => {
  try {
    getHaptic()?.notificationOccurred?.(type);
  } catch {
    /* отклик недоступен — игнорируем */
  }
};

/**
 * Отклик переключения/выбора.
 * @returns {void}
 */
export const hapticSelection = () => {
  try {
    getHaptic()?.selectionChanged?.();
  } catch {
    /* отклик недоступен — игнорируем */
  }
};
