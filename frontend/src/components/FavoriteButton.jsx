import { useState } from 'react';
import { Icon } from './icons';
import { useFavorites } from '../hooks/useFavorites';
import { useTelegram } from '../hooks/useTelegram';

/**
 * @param {{ productId: number, className?: string }} props
 */
export function FavoriteButton({ productId, className = '' }) {
  const { tg } = useTelegram();
  const { isFavorite, toggle } = useFavorites();
  const [busy, setBusy] = useState(false);
  const fav = isFavorite(productId);

  return (
    <button
      type="button"
      className={`favorite-btn${fav ? ' favorite-btn--on' : ''}${className ? ` ${className}` : ''}`}
      disabled={busy}
      onClick={async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (busy) return;
        setBusy(true);
        try {
          await toggle(productId);
          tg?.HapticFeedback?.impactOccurred?.('light');
        } catch {
          tg?.HapticFeedback?.notificationOccurred?.('error');
        } finally {
          setBusy(false);
        }
      }}
      aria-label={fav ? 'Убрать из избранного' : 'Добавить в избранное'}
    >
      <Icon name={fav ? 'heart-filled' : 'heart'} size="sm" />
    </button>
  );
}
