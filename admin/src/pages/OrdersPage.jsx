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
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    const q = filter ? `&status=${encodeURIComponent(filter)}` : '';
    adminFetch(`/api/admin/orders?limit=100${q}`)
      .then(d => { setList(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => { setList([]); setLoading(false); });
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

  return (
    <>
      <h1 className="h1">Заказы</h1>
      <p className="muted">
        Владелец видит здесь все заказы. Клиенту в Telegram автоматически уходит сообщение при статусах «Выдан клиенту» и «Отменён».
        Личную переписку удобно вести ответом на уведомление бота или по ссылке на клиента в уведомлении.
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
                {list.map(o => (
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
                    <td style={{ fontWeight: 800 }}>{formatByn(o.total)}</td>
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
                            if (!window.confirm('Отменить заказ и уведомить клиента?')) return;
                            updateStatus(o.id, 'cancelled');
                          }}
                        >
                          Отменить
                        </button>
                      </div>
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
                ))}
              </tbody>
            </table>
            {list.length === 0 && <p className="muted" style={{ padding: 8 }}>Заказов нет</p>}
          </div>
        )}
      </div>
    </>
  );
}
