import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/api';

const STATUSES = ['new', 'replied', 'processing', 'done'];

function money(n) {
  return `${Number(n || 0).toLocaleString('ru')} ₽`;
}

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
      <p className="muted">Список и смена статуса. Ответы клиенту по-прежнему удобнее через бота (ответ на уведомление владельцу).</p>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="field" style={{ width: 200 }}>
          <span className="label">Статус</span>
          <select className="select" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Все</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
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
                    </td>
                    <td style={{ fontWeight: 800 }}>{money(o.total)}</td>
                    <td>
                      <select
                        className="select"
                        value={o.status}
                        onChange={e => updateStatus(o.id, e.target.value)}
                        style={{ minWidth: 120 }}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
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
