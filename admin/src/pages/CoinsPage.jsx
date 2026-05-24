import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/api';

/**
 * @typedef {{ telegram_user_id: string, balance: number, updated_at?: string }} WalletRow
 */

export default function CoinsPage() {
  const [wallets, setWallets] = useState(/** @type {WalletRow[]} */ ([]));
  const [customers, setCustomers] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ telegram_user_id: '', delta: '100' });

  /**
   * Загружает кошельки и клиентов из заказов.
   */
  function load() {
    setLoading(true);
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    Promise.all([
      adminFetch(`/api/admin/wallets${query}`),
      adminFetch('/api/admin/order-customers'),
    ])
      .then(([walletRows, customerRows]) => {
        setWallets(Array.isArray(walletRows) ? walletRows : []);
        setCustomers(Array.isArray(customerRows) ? customerRows : []);
      })
      .catch(() => {
        setWallets([]);
        setCustomers([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  /**
   * Начисляет или списывает монеты пользователю.
   * @param {string} telegramUserId
   * @param {number} delta
   */
  async function adjustWallet(telegramUserId, delta) {
    const uid = String(telegramUserId ?? '').trim();
    const change = Number(delta);
    if (!uid || !Number.isFinite(change) || !change) return;

    try {
      const result = await adminFetch(`/api/admin/wallets/${encodeURIComponent(uid)}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ delta: change }),
      });
      alert(`Баланс ${uid}: ${result.balance} монет`);
      load();
    } catch (e) {
      alert(e?.message || 'Не удалось изменить баланс');
    }
  }

  /**
   * Устанавливает абсолютный баланс.
   * @param {React.FormEvent<HTMLFormElement>} event
   */
  async function submitForm(event) {
    event.preventDefault();
    const uid = form.telegram_user_id.trim();
    const delta = Number(form.delta);
    if (!uid || !Number.isFinite(delta)) return;
    await adjustWallet(uid, delta);
    setForm({ telegram_user_id: '', delta: '100' });
  }

  const walletMap = new Map(wallets.map((wallet) => [String(wallet.telegram_user_id), wallet.balance]));

  return (
    <>
      <h1 className="h1">Монетки лаунжа</h1>
      <p className="muted">
        Начисляй монеты вручную для теста jukebox и будущих скинов. За выданный заказ начисляется автоматически.
      </p>

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div className="label" style={{ marginBottom: 8 }}>Начислить / списать монеты</div>
        <form className="row" onSubmit={submitForm} style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="field" style={{ flex: '1 1 180px' }}>
            <span className="label">Telegram user id</span>
            <input
              className="input"
              value={form.telegram_user_id}
              onChange={(event) => setForm((prev) => ({ ...prev, telegram_user_id: event.target.value }))}
              placeholder="123456789"
              required
            />
          </div>
          <div className="field" style={{ flex: '1 1 140px' }}>
            <span className="label">Изменение (+/-)</span>
            <input
              className="input"
              type="number"
              value={form.delta}
              onChange={(event) => setForm((prev) => ({ ...prev, delta: event.target.value }))}
              placeholder="100"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end', width: 'auto' }}>
            Применить
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: '1 1 220px' }}>
            <span className="label">Поиск по Telegram ID</span>
            <input
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="609938171"
            />
          </div>
          <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-end' }} onClick={load}>
            Найти
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <strong>Кошельки</strong>
        </div>
        {loading ? (
          <p className="muted" style={{ padding: 16 }}>Загрузка…</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Telegram ID</th>
                  <th>Баланс</th>
                  <th>Обновлён</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {wallets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">Кошельков пока нет</td>
                  </tr>
                ) : wallets.map((wallet) => (
                  <tr key={wallet.telegram_user_id}>
                    <td>{wallet.telegram_user_id}</td>
                    <td><strong>{wallet.balance}</strong></td>
                    <td>{wallet.updated_at ? String(wallet.updated_at).slice(0, 19) : '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-ghost" onClick={() => adjustWallet(wallet.telegram_user_id, 50)}>+50</button>
                        <button type="button" className="btn btn-ghost" onClick={() => adjustWallet(wallet.telegram_user_id, 100)}>+100</button>
                        <button type="button" className="btn btn-danger" onClick={() => adjustWallet(wallet.telegram_user_id, -50)}>-50</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <strong>Клиенты из заказов</strong>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Telegram ID</th>
                <th>Имя</th>
                <th>Username</th>
                <th>Баланс</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                const uid = String(customer.telegram_user_id || '');
                return (
                  <tr key={uid}>
                    <td>{uid}</td>
                    <td>{String(customer.telegram_first_name || '—')}</td>
                    <td>{customer.telegram_username ? `@${customer.telegram_username}` : '—'}</td>
                    <td>{walletMap.get(uid) ?? 0}</td>
                    <td>
                      <button type="button" className="btn btn-primary" onClick={() => adjustWallet(uid, 100)}>
                        +100 монет
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
