import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useTelegram } from './useTelegram';
import { apiFetch } from '../lib/api';

/** @type {React.Context<null | {
 *   ids: Set<number>,
 *   loading: boolean,
 *   toggle: (productId: number) => Promise<boolean>,
 *   isFavorite: (productId: number) => boolean,
 *   reload: () => Promise<void>,
 * }>} */
const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { user } = useTelegram();
  const [ids, setIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/favorites/user/${user.id}`);
      const data = await res.json();
      setIds(new Set((data.product_ids || []).map(Number)));
    } catch {
      setIds(new Set());
    }
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggle = useCallback(async (productId) => {
    const pid = Number(productId);
    const res = await apiFetch('/api/favorites/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_user_id: String(user.id),
        product_id: pid,
      }),
    });
    const data = await res.json();
    setIds((prev) => {
      const next = new Set(prev);
      if (data.favorited) next.add(pid);
      else next.delete(pid);
      return next;
    });
    return Boolean(data.favorited);
  }, [user.id]);

  const isFavorite = useCallback(
    (productId) => ids.has(Number(productId)),
    [ids],
  );

  return (
    <FavoritesContext.Provider value={{ ids, loading, toggle, isFavorite, reload }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
