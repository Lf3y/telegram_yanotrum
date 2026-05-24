import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

/**
 * @typedef {{ coinsPerOrder: number, jukeboxSongCost: number }} LoungeConfig
 */

/**
 * Хук баланса монет и конфигурации лаунжа.
 * @param {string | number} userId
 */
export function useLoungeWallet(userId) {
  const [balance, setBalance] = useState(0);
  const [config, setConfig] = useState({ coinsPerOrder: 10, jukeboxSongCost: 15 });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [walletRes, configRes] = await Promise.all([
        apiFetch(`/api/lounge/wallet/${userId}`),
        apiFetch('/api/lounge/config'),
      ]);
      const wallet = await walletRes.json();
      const cfg = await configRes.json();
      setBalance(Number(wallet.balance || 0));
      setConfig({
        coinsPerOrder: Number(cfg.coinsPerOrder || 10),
        jukeboxSongCost: Number(cfg.jukeboxSongCost || 15),
      });
    } catch {
      setBalance(0);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { balance, config, loading, reload, setBalance };
}
