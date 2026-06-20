import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/api';
import { formatByn } from '../lib/money';

/** @param {number|undefined} n */
function money(n) {
  return formatByn(n);
}

/** значение статуса в БД → подпись и цвет */
const STATUS_META = {
  new: { label: 'Новые', color: 'var(--accent2)' },
  processing: { label: 'В обработке', color: 'var(--amber)' },
  replied: { label: 'Связались', color: '#38bdf8' },
  done: { label: 'Выдано', color: 'var(--green)' },
  cancelled: { label: 'Отменено', color: 'var(--text3)' },
};
const STATUS_ORDER = ['new', 'processing', 'replied', 'done', 'cancelled'];

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setErr('');
    adminFetch(`/api/admin/analytics/summary?days=${days}`)
      .then(setData)
      .catch((e) => setErr(e?.message || 'Ошибка'));
  }, [days]);

  if (err) {
    return <div className="card" style={{ borderColor: 'rgba(255,45,45,0.3)', background: 'rgba(255,45,45,0.08)' }}>{err}</div>;
  }
  if (!data) {
    return <div className="muted">Загрузка…</div>;
  }

  const o = data.overview || {};
  const series = data.series || [];
  const maxRev = Math.max(1, ...series.map((s) => Number(s.revenue) || 0));
  const productStats = data.productStats || {};
  const statusCounts = data.statusCounts || [];
  const topProducts = data.topProducts || [];
  const totalOrders = statusCounts.reduce((sum, s) => sum + (s.count || 0), 0);
  const maxTop = Math.max(1, ...topProducts.map((p) => p.qty || 0));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="h1">Аналитика</h1>
          <p className="muted">Продажи, заказы, клиенты и остатки</p>
        </div>
        <div className="field" style={{ width: 130 }}>
          <span className="label">Период (дней)</span>
          <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
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
          <div className="kpi-sub">{money(o.revenue_today)} <span style={{ fontWeight: 400 }}>выданные</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-lab">Месяц (заказы)</div>
          <div className="kpi-val">{o.orders_month ?? 0}</div>
          <div className="kpi-sub">{money(o.revenue_month)} <span style={{ fontWeight: 400 }}>выданные</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-lab">Всего заказов</div>
          <div className="kpi-val">{o.orders_all ?? 0}</div>
          <div className="kpi-sub">за всё время</div>
        </div>
        <div className="kpi">
          <div className="kpi-lab">Выручка всего</div>
          <div className="kpi-val" style={{ fontSize: 19 }}>{money(o.revenue_all)}</div>
          <div className="kpi-sub" style={{ fontSize: 11 }}>по статусу «Выдан»</div>
        </div>
        <div className="kpi">
          <div className="kpi-lab">Средний чек</div>
          <div className="kpi-val" style={{ fontSize: 19 }}>{money(data.avgOrderValue)}</div>
          <div className="kpi-sub">по выданным</div>
        </div>
        <div className="kpi">
          <div className="kpi-lab">Клиенты</div>
          <div className="kpi-val">{data.customers ?? 0}</div>
          <div className="kpi-sub">уникальных покупателей</div>
        </div>
        <div className="kpi">
          <div className="kpi-lab">Товары активны</div>
          <div className="kpi-val">{productStats.active ?? 0}</div>
          <div className="kpi-sub">из {productStats.total ?? 0} всего</div>
        </div>
        <div className="kpi">
          <div className="kpi-lab">Нет в наличии</div>
          <div className="kpi-val" style={{ color: productStats.outOfStock ? 'var(--accent2)' : undefined }}>
            {productStats.outOfStock ?? 0}
          </div>
          <div className="kpi-sub">+{productStats.lowStock ?? 0} заканчиваются</div>
        </div>
      </div>

      <div className="card">
        <h3>График выручки (по дням)</h3>
        <p className="muted" style={{ marginTop: 0 }}>Столбцы — сумма только по заказам со статусом «Выдан» (по дате оформления)</p>
        {series.length === 0 ? (
          <p className="muted">Пока нет заказов в выбранном периоде</p>
        ) : (
          <div className="bar-chart">
            {series.map((s) => {
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

      <div className="split2">
        <div className="card">
          <h3>Заказы по статусам</h3>
          {totalOrders === 0 ? (
            <p className="muted">Заказов пока нет</p>
          ) : (
            <div className="stat-rows">
              {STATUS_ORDER.filter((key) => statusCounts.some((s) => s.status === key)).map((key) => {
                const meta = STATUS_META[key] || { label: key, color: 'var(--text2)' };
                const row = statusCounts.find((s) => s.status === key) || { count: 0, sum: 0 };
                const pct = totalOrders ? Math.round((row.count / totalOrders) * 100) : 0;
                return (
                  <div key={key} className="stat-row">
                    <div className="stat-row-top">
                      <span className="stat-row-label">
                        <span className="stat-dot" style={{ background: meta.color }} />
                        {meta.label}
                      </span>
                      <span className="stat-row-val">{row.count} · {money(row.sum)}</span>
                    </div>
                    <div className="stat-bar">
                      <div className="stat-bar-fill" style={{ width: `${pct}%`, background: meta.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Топ товаров (по продажам)</h3>
          {topProducts.length === 0 ? (
            <p className="muted">Нет данных по выданным заказам</p>
          ) : (
            <div className="stat-rows">
              {topProducts.map((p, i) => {
                const pct = Math.round((p.qty / maxTop) * 100);
                return (
                  <div key={`${p.name}-${i}`} className="stat-row">
                    <div className="stat-row-top">
                      <span className="stat-row-label" style={{ minWidth: 0 }}>
                        <span className="stat-rank">{i + 1}</span>
                        <span className="stat-row-name">{p.name}</span>
                      </span>
                      <span className="stat-row-val">{p.qty} шт · {money(p.revenue)}</span>
                    </div>
                    <div className="stat-bar">
                      <div className="stat-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
                {data.lowStock.map((p) => (
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
