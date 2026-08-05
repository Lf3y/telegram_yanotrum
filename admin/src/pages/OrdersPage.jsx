import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/api';
import { formatByn } from '../lib/money';

/** значение в БД → подпись в интерфейсе */
const STATUS_OPTIONS = [
  { value: 'new', label: 'Новый' },
  { value: 'processing', label: 'В обработке' },
  { value: 'replied', label: 'Связались с клиентом' },
  { value: 'done', label: 'Выдан клиенту' },
  { value: 'cancelled', label: 'Отменён' },
];

export default function OrdersPage() {
  const [list, setList] = useState([]);
  const [blockedIds, setBlockedIds] = useState(/** @type {Set<string>} */ (new Set()));
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    const q = filter ? `&status=${encodeURIComponent(filter)}` : '';
    Promise.all([
      adminFetch(`/api/admin/orders?limit=100${q}`),
      adminFetch('/api/admin/blocked-users'),
    ])
      .then(([orders, blocked]) => {
        setList(Array.isArray(orders) ? orders : []);
        setBlockedIds(new Set(
          (Array.isArray(blocked) ? blocked : []).map((row) => String(row.telegram_user_id)),
        ));
        setLoading(false);
      })
      .catch(() => {
        setList([]);
        setBlockedIds(new Set());
        setLoading(false);
      });
  }

  useEffect(() => { load(); }, [filter]);

  async function updateStatus(id, status) {
    try {
      await adminFetch(`/api/admin/orders/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      load();
    } catch (e) {
      alert(e?.message);
    }
  }

  async function blockUser(telegramUserId) {
    const uid = String(telegramUserId ?? '').trim();
    if (!uid) return;
    const reason = window.prompt('Причина блокировки (необязательно):') ?? '';
    try {
      await adminFetch('/api/admin/blocked-users', {
        method: 'POST',
        body: JSON.stringify({
          telegram_user_id: uid,
          reason: reason || null,
          blocked_by: 'admin',
        }),
      });
      alert(`Пользователь ${uid} заблокирован`);
      load();
    } catch (e) {
      alert(e?.message || 'Ошибка блокировки');
    }
  }

  async function unblockUser(telegramUserId) {
    const uid = String(telegramUserId ?? '').trim();
    if (!uid) return;
    if (!window.confirm(`Разблокировать пользователя ${uid}?`)) return;
    try {
      await adminFetch(`/api/admin/blocked-users/${encodeURIComponent(uid)}`, {
        method: 'DELETE',
      });
      alert(`Пользователь ${uid} разблокирован`);
      load();
    } catch (e) {
      alert(e?.message || 'Ошибка разблокировки');
    }
  }

  return (
    <>
      <h1 className="h1">Заказы</h1>
      <p className="muted">
        Остатки резервируются при оформлении заказа клиентом. При отмене — возвращаются на склад.
        Кнопки «Выдан» / «Отменить» в Telegram и здесь работают одинаково. Клиенту уходит уведомление при «Выдан» и «Отменён».
      </p>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="field" style={{ width: 220 }}>
          <span className="label">Статус</span>
          <select className="select" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Все</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <button type="button" className="btn" onClick={load} style={{ alignSelf: 'flex-end' }}>Обновить</button>
      </div>

      <div className="card">
        {loading ? <p className="muted">Загрузка…</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Дата</th>
                  <th>Клиент</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Действия</th>
                  <th>Товары</th>
                </tr>
              </thead>
              <tbody>
                {list.map(o => {
                  const uid = String(o.telegram_user_id ?? '');
                  const isBlocked = blockedIds.has(uid);
                  return (
                  <tr key={o.id}>
                    <td className="kbd">{o.id}</td>
                    <td>{o.created_at}</td>
                    <td>
                      {o.telegram_first_name || '—'}
                      <div className="kbd" style={{ marginTop: 2 }}>{o.telegram_user_id}</div>
                      {o.telegram_username && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          @{String(o.telegram_username).replace(/^@/, '')}
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 800 }}>
                      {formatByn(o.total)}
                      {Number(o.discount_total) > 0 && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 2, fontWeight: 600 }}>
                          скидка −{formatByn(o.discount_total)}
                        </div>
                      )}
                      {o.coupon_title && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 2, fontWeight: 600 }}>
                          🎟 {String(o.coupon_title)}
                        </div>
                      )}
                    </td>
                    <td>
                      <select
                        className="select"
                        value={o.status}
                        onChange={e => updateStatus(o.id, e.target.value)}
                        style={{ minWidth: 170 }}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap', maxWidth: 200 }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => updateStatus(o.id, 'done')}
                        >
                          Выдан
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            if (!window.confirm('Отменить заказ? Остатки вернутся на склад.')) return;
                            updateStatus(o.id, 'cancelled');
                          }}
                        >
                          Отменить
                        </button>
                      </div>
                      {isBlocked ? (
                        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span className="badge badge-bad">Заблокирован</span>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => unblockUser(uid)}
                          >
                            Разблокировать
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          style={{ marginTop: 6 }}
                          onClick={() => blockUser(uid)}
                        >
                          🚫 Заблокировать клиента
                        </button>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-ok">{(o.items || []).length} поз.</span>
                      <div className="muted" style={{ fontSize: 11, marginTop: 4, maxWidth: 280 }}>
                        {(o.items || []).map((it, i) => (
                          <div key={i}>{it.name} ×{it.qty}</div>
                        ))}
                      </div>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
            {list.length === 0 && <p className="muted" style={{ padding: 8 }}>Заказов нет</p>}
          </div>
        )}
      </div>
    </>
  );
}
