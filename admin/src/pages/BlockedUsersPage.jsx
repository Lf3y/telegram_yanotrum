import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/api';

export default function BlockedUsersPage() {
  const [blocked, setBlocked] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ telegram_user_id: '', reason: '' });

  function load() {
    setLoading(true);
    Promise.all([
      adminFetch('/api/admin/blocked-users'),
      adminFetch('/api/admin/order-customers'),
    ])
      .then(([b, c]) => {
        setBlocked(Array.isArray(b) ? b : []);
        setCustomers(Array.isArray(c) ? c : []);
      })
      .catch(() => {
        setBlocked([]);
        setCustomers([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function blockUser(telegramUserId, reason) {
    const uid = String(telegramUserId ?? '').trim();
    if (!uid) return;
    try {
      await adminFetch('/api/admin/blocked-users', {
        method: 'POST',
        body: JSON.stringify({
          telegram_user_id: uid,
          reason: reason || null,
          blocked_by: 'admin',
        }),
      });
      load();
    } catch (e) {
      alert(e?.message || 'Ошибка блокировки');
    }
  }

  async function unblockUser(telegramUserId) {
    try {
      await adminFetch(`/api/admin/blocked-users/${encodeURIComponent(telegramUserId)}`, {
        method: 'DELETE',
      });
      load();
    } catch (e) {
      alert(e?.message || 'Ошибка разблокировки');
    }
  }

  async function submitForm(e) {
    e.preventDefault();
    await blockUser(form.telegram_user_id, form.reason);
    setForm({ telegram_user_id: '', reason: '' });
  }

  const blockedIds = new Set(blocked.map((b) => String(b.telegram_user_id)));

  return (
    <>
      <h1 className="h1">Заблокированные пользователи</h1>
      <p className="muted">
        Заблокированный клиент не сможет оформить заказ и получит сообщение при /start в боте.
      </p>

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div className="label" style={{ marginBottom: 8 }}>Заблокировать по Telegram ID</div>
        <form className="row" onSubmit={submitForm} style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="field" style={{ flex: '1 1 180px' }}>
            <span className="label">Telegram user id</span>
            <input
              className="input"
              value={form.telegram_user_id}
              onChange={(e) => setForm((f) => ({ ...f, telegram_user_id: e.target.value }))}
              placeholder="123456789"
              required
            />
          </div>
          <div className="field" style={{ flex: '2 1 220px' }}>
            <span className="label">Причина (необязательно)</span>
            <input
              className="input"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Нарушение правил"
            />
          </div>
          <button type="submit" className="btn btn-danger" style={{ alignSelf: 'flex-end', width: 'auto' }}>
            Заблокировать
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <strong>Список блокировок</strong>
        </div>
        {loading ? (
          <p className="muted" style={{ padding: 16 }}>Загрузка…</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Telegram ID</th>
                  <th>Причина</th>
                  <th>Когда</th>
                  <th>Кем</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {blocked.map((row) => (
                  <tr key={row.id}>
                    <td className="kbd">{row.telegram_user_id}</td>
                    <td>{row.reason || '—'}</td>
                    <td>{row.blocked_at}</td>
                    <td>{row.blocked_by || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => unblockUser(row.telegram_user_id)}
                      >
                        Разблокировать
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {blocked.length === 0 && <p className="muted" style={{ padding: 16 }}>Никто не заблокирован</p>}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <strong>Клиенты из истории заказов</strong>
        </div>
        {loading ? (
          <p className="muted" style={{ padding: 16 }}>Загрузка…</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Telegram ID</th>
                  <th>Заказов</th>
                  <th>Последний заказ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const uid = String(c.telegram_user_id);
                  const isBlocked = blockedIds.has(uid);
                  return (
                    <tr key={uid}>
                      <td>
                        {c.telegram_first_name || '—'}
                        {c.telegram_username && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            @{String(c.telegram_username).replace(/^@/, '')}
                          </div>
                        )}
                      </td>
                      <td className="kbd">{uid}</td>
                      <td>{c.order_count}</td>
                      <td>{c.last_order_at}</td>
                      <td>
                        {isBlocked ? (
                          <span className="badge badge-bad">Заблокирован</span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => {
                              const reason = window.prompt('Причина блокировки (необязательно):') ?? '';
                              blockUser(uid, reason);
                            }}
                          >
                            Заблокировать
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {customers.length === 0 && <p className="muted" style={{ padding: 16 }}>Заказов пока не было</p>}
          </div>
        )}
      </div>
    </>
  );
}
