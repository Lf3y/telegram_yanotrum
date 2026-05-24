import { Icon } from './icons';
import { useFavorites } from '../hooks/useFavorites';

/**
 * @param {{ productId: number, className?: string }} props
 */
export function FavoriteButton({ productId, className = '' }) {
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(productId);

  return (
    <button
      type="button"
      className={`favorite-btn${fav ? ' favorite-btn--on' : ''}${className ? ` ${className}` : ''}`}
      onClick={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        toggle(productId);
      }}
      aria-label={fav ? 'Убрать из избранного' : 'Добавить в избранное'}
    >
      <Icon name={fav ? 'heart-filled' : 'heart'} size="sm" />
    </button>
  );
}
