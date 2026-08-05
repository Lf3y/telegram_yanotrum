import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/api';
import { formatByn } from '../lib/money';

const TYPE_LABELS = {
  percent: 'Скидка %',
  fixed: 'Скидка BYN',
  free_item: 'Подарок (банка жижи и т.п.)',
};

const SOURCE_LABELS = {
  admin: 'Выдан вручную',
  event: 'Ивент (всем)',
  referral: 'За реферала',
  referral_10: 'За каждые 10 рефералов',
};

/** @param {Record<string, unknown>} coupon */
function couponValue(coupon) {
  const type = String(coupon.type);
  if (type === 'percent') return `−${Number(coupon.value)}%`;
  if (type === 'fixed') return `−${formatByn(coupon.value)}`;
  return '🎁 подарок';
}

/** @param {string | null | undefined} raw */
function shortDate(raw) {
  if (!raw) return '—';
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const EMPTY_FORM = {
  target: 'user', // 'user' | 'event'
  user_id: '',
  type: 'percent',
  value: '5',
  title: '',
  description: '',
  uses_total: '1',
  expires_at: '',
};

export default function CouponsPage() {
  const [tab, setTab] = useState('coupons'); // 'coupons' | 'referrals'
  const [coupons, setCoupons] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [referrers, setReferrers] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [customers, setCustomers] = useState(/** @type {Record<string, unknown>[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  function load() {
    setLoading(true);
    Promise.all([
      adminFetch('/api/admin/coupons'),
      adminFetch('/api/admin/referrals'),
      adminFetch('/api/admin/order-customers'),
    ])
      .then(([couponRows, referralRows, customerRows]) => {
        setCoupons(Array.isArray(couponRows) ? couponRows : []);
        setReferrers(Array.isArray(referralRows) ? referralRows : []);
        setCustomers(Array.isArray(customerRows) ? customerRows : []);
      })
      .catch((e) => alert(e?.message || 'Не удалось загрузить купоны'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  /** @param {string} key @param {string} value */
  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** @param {React.FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault();
    if (form.target === 'user' && !form.user_id.trim()) {
      alert('Укажите Telegram ID клиента или выберите его из списка ниже');
      return;
    }
    setSaving(true);
    try {
      await adminFetch('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify({
          user_id: form.target === 'user' ? form.user_id.trim() : null,
          type: form.type,
          value: form.type === 'free_item' ? 0 : Number(form.value),
          title: form.title.trim(),
          description: form.description.trim() || null,
          uses_total: Number(form.uses_total) || 1,
          expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        }),
      });
      setForm({ ...EMPTY_FORM });
      load();
    } catch (e) {
      alert(e?.message || 'Не удалось создать купон');
    }
    setSaving(false);
  }

  /** @param {Record<string, unknown>} coupon */
  async function toggleActive(coupon) {
    try {
      await adminFetch(`/api/admin/coupons/${coupon.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: Number(coupon.active) !== 1 }),
      });
      load();
    } catch (e) {
      alert(e?.message || 'Не удалось изменить купон');
    }
  }

  /** @param {Record<string, unknown>} coupon */
  async function removeCoupon(coupon) {
    if (!confirm(`Удалить купон «${coupon.title}»? История использований тоже удалится.`)) return;
    try {
      await adminFetch(`/api/admin/coupons/${coupon.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert(e?.message || 'Не удалось удалить купон');
    }
  }

  return (
    <>
      <h1 className="h1">Купоны и рефералы</h1>
      <p className="muted">
        Выдавайте купоны клиентам, запускайте ивенты для всех и следите за реферальной программой.
        Клиент применяет купон в корзине; вы увидите его в уведомлении о заказе.
      </p>

      <div className="row" style={{ gap: 8, marginTop: 16 }}>
        <button
          type="button"
          className={tab === 'coupons' ? 'btn btn-primary' : 'btn btn-ghost'}
          style={{ width: 'auto' }}
          onClick={() => setTab('coupons')}
        >
          Купоны
        </button>
        <button
          type="button"
          className={tab === 'referrals' ? 'btn btn-primary' : 'btn btn-ghost'}
          style={{ width: 'auto' }}
          onClick={() => setTab('referrals')}
        >
          Рефералы
        </button>
      </div>

      {tab === 'coupons' && (
        <>
          <div className="card" style={{ marginTop: 16, padding: 16 }}>
            <div className="label" style={{ marginBottom: 10 }}>Создать купон</div>
            <form onSubmit={submit}>
              <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
                <div className="field" style={{ flex: '1 1 180px' }}>
                  <span className="label">Кому</span>
                  <select
                    className="input"
                    value={form.target}
                    onChange={(e) => setField('target', e.target.value)}
                  >
                    <option value="user">Конкретному клиенту</option>
                    <option value="event">Всем (ивент)</option>
                  </select>
                </div>
                {form.target === 'user' && (
                  <div className="field" style={{ flex: '1 1 180px' }}>
                    <span className="label">Telegram ID клиента</span>
                    <input
                      className="input"
                      value={form.user_id}
                      onChange={(e) => setField('user_id', e.target.value)}
                      placeholder="123456789"
                      list="coupon-customers"
                    />
                    <datalist id="coupon-customers">
                      {customers.map((c) => (
                        <option key={String(c.telegram_user_id)} value={String(c.telegram_user_id)}>
                          {String(c.telegram_first_name || '')} {c.telegram_username ? `@${c.telegram_username}` : ''}
                        </option>
                      ))}
                    </datalist>
                  </div>
                )}
                <div className="field" style={{ flex: '1 1 180px' }}>
                  <span className="label">Тип</span>
                  <select
                    className="input"
                    value={form.type}
                    onChange={(e) => setField('type', e.target.value)}
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                {form.type !== 'free_item' && (
                  <div className="field" style={{ flex: '1 1 120px' }}>
                    <span className="label">{form.type === 'percent' ? 'Скидка, %' : 'Скидка, BYN'}</span>
                    <input
                      className="input"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.value}
                      onChange={(e) => setField('value', e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>

              <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                <div className="field" style={{ flex: '2 1 240px' }}>
                  <span className="label">Название (видит клиент)</span>
                  <input
                    className="input"
                    value={form.title}
                    onChange={(e) => setField('title', e.target.value)}
                    placeholder="Например: Скидка недели −10%"
                    required
                  />
                </div>
                <div className="field" style={{ flex: '1 1 120px' }}>
                  <span className="label">{form.target === 'event' ? 'Использований на клиента' : 'Использований'}</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={form.uses_total}
                    onChange={(e) => setField('uses_total', e.target.value)}
                    required
                  />
                </div>
                <div className="field" style={{ flex: '1 1 170px' }}>
                  <span className="label">Действует до (необязательно)</span>
                  <input
                    className="input"
                    type="datetime-local"
                    value={form.expires_at}
                    onChange={(e) => setField('expires_at', e.target.value)}
                  />
                </div>
              </div>

              <div className="field" style={{ marginTop: 10 }}>
                <span className="label">Описание (необязательно)</span>
                <input
                  className="input"
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder="Условия, повод, комментарий для клиента"
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: 'auto', marginTop: 12 }} disabled={saving}>
                {saving ? 'Создаём…' : form.target === 'event' ? 'Запустить ивент для всех' : 'Выдать купон'}
              </button>
            </form>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <strong>Все купоны</strong>
            </div>
            {loading ? (
              <p className="muted" style={{ padding: 16 }}>Загрузка…</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Название</th>
                      <th>Значение</th>
                      <th>Кому</th>
                      <th>Источник</th>
                      <th>Исп. / лимит</th>
                      <th>До</th>
                      <th>Статус</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.length === 0 ? (
                      <tr><td colSpan={9} className="muted">Купонов пока нет</td></tr>
                    ) : coupons.map((c) => (
                      <tr key={String(c.id)} style={Number(c.active) !== 1 ? { opacity: 0.55 } : undefined}>
                        <td>{String(c.id)}</td>
                        <td><strong>{String(c.title)}</strong></td>
                        <td>{couponValue(c)}</td>
                        <td>{c.is_event ? '🌍 Все' : String(c.user_id)}</td>
                        <td>{SOURCE_LABELS[String(c.source)] || String(c.source)}</td>
                        <td>{String(c.uses_count ?? 0)} / {String(c.uses_total)}{c.is_event ? ' на клиента' : ''}</td>
                        <td>{shortDate(c.expires_at)}</td>
                        <td>{Number(c.active) === 1 ? '✅ Активен' : '⛔ Выключен'}</td>
                        <td>
                          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-ghost" onClick={() => toggleActive(c)}>
                              {Number(c.active) === 1 ? 'Выключить' : 'Включить'}
                            </button>
                            <button type="button" className="btn btn-danger" onClick={() => removeCoupon(c)}>
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'referrals' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <strong>Топ рефереров</strong>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              «С покупкой» — приглашённые, у которых есть выданный заказ. Награды выдаются автоматически.
            </div>
          </div>
          {loading ? (
            <p className="muted" style={{ padding: 16 }}>Загрузка…</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Реферер</th>
                    <th>Telegram ID</th>
                    <th>Приглашено</th>
                    <th>С покупкой</th>
                    <th>Заказов от рефералов</th>
                  </tr>
                </thead>
                <tbody>
                  {referrers.length === 0 ? (
                    <tr><td colSpan={5} className="muted">Пока никто никого не пригласил</td></tr>
                  ) : referrers.map((r) => (
                    <tr key={String(r.referrer_user_id)}>
                      <td>
                        {String(r.referrer_name || '—')}
                        {r.referrer_username ? ` (@${r.referrer_username})` : ''}
                      </td>
                      <td>{String(r.referrer_user_id)}</td>
                      <td>{String(r.invited)}</td>
                      <td><strong>{String(r.qualified)}</strong></td>
                      <td>{String(r.referral_orders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
