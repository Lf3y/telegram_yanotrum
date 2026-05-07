import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/api';

function money(n) {
  return `${Number(n || 0).toLocaleString('ru')} ₽`;
}

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setErr('');
    adminFetch(`/api/admin/analytics/summary?days=${days}`)
      .then(setData)
      .catch(e => setErr(e?.message || 'Ошибка'));
  }, [days]);

  if (err) {
    return <div className="card" style={{ borderColor: 'rgba(255,45,45,0.3)', background: 'rgba(255,45,45,0.08)' }}>{err}</div>;
  }
  if (!data) {
    return <div className="muted">Загрузка…</div>;
  }

  const o = data.overview || {};
  const series = data.series || [];
  const maxRev = Math.max(1, ...series.map(s => Number(s.revenue) || 0));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="h1">Аналитика</h1>
          <p className="muted">Продажи, заказы и критичные остатки</p>
        </div>
        <div className="field" style={{ width: 120 }}>
          <span className="label">Период (дней)</span>
          <select className="select" value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>7</option>
            <option value={14}>14</option>
            <option value={30}>30</option>
            <option value={90}>90</option>
          </select>
        </div>
      </div>

      <div className="grid-kpi">
        <div className="kpi">
          <div className="kpi-lab">Сегодня (заказы)</div>
          <div className="kpi-val">{o.orders_today ?? 0}</div>
          <div className="kpi-sub">{money(o.revenue_today)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-lab">Месяц</div>
          <div className="kpi-val">{o.orders_month ?? 0}</div>
          <div className="kpi-sub">{money(o.revenue_month)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-lab">Всего заказов</div>
          <div className="kpi-val">{o.orders_all ?? 0}</div>
          <div className="kpi-sub">за всё время</div>
        </div>
        <div className="kpi">
          <div className="kpi-lab">Выручка всего</div>
          <div className="kpi-val" style={{ fontSize: 18 }}>{money(o.revenue_all)}</div>
        </div>
      </div>

      <div className="card">
        <h3>График выручки (по дням)</h3>
        <p className="muted" style={{ marginTop: 0 }}>Каждый столбик — сумма заказов за день</p>
        {series.length === 0 ? (
          <p className="muted">Пока нет заказов в выбранном периоде</p>
        ) : (
          <div className="bar-chart">
            {series.map(s => {
              const h = Math.max(4, (Number(s.revenue) / maxRev) * 120);
              return (
                <div key={s.d} className="bar" style={{ height: `${h}px` }} title={`${s.d}: ${money(s.revenue)}`}>
                  <div className="bar-tip">{s.d?.slice(5)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Низкий остаток (1–5 шт.)</h3>
        {(!data.lowStock || !data.lowStock.length) ? (
          <p className="muted">Все позиции в порядке</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Название</th>
                  <th>Остаток</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map(p => (
                  <tr key={p.id}>
                    <td className="kbd">{p.id}</td>
                    <td>{p.name}</td>
                    <td><span className="badge badge-warn">{p.stock_qty} шт.</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
