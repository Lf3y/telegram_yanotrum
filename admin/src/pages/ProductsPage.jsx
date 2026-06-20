import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminFetch, adminUpload } from '../lib/api';

function toPayload(l) {
  const { brandNameText, ...raw } = l;
  const brandId = l.brand_id === '' || l.brand_id == null ? null : Number(l.brand_id);
  const nameFromPick = brandNameText != null && String(brandNameText).trim() !== '' ? String(brandNameText).trim() : null;
  return {
    ...raw,
    category_id: Number(l.category_id),
    price: Number(l.price),
    old_price: l.old_price == null || l.old_price === '' ? null : Number(l.old_price),
    sort_order: Number(l.sort_order || 0),
    brand_id: brandId,
    brand: brandId == null ? null : (nameFromPick ?? l.brand ?? null),
    stock_qty: l.stock_qty === '' ? -1 : Number(l.stock_qty),
    in_stock: !!l.in_stock,
  };
}

function Row({ p, categories, onSaved, onDelete, isHighlighted }) {
  const [local, setLocal] = useState(() => ({
    ...p,
    stock_qty: p.stock_qty == null ? -1 : p.stock_qty,
    brandNameText: p.brand || '',
  }));
  const [rowBrands, setRowBrands] = useState([]);
  const [saving, setSaving] = useState(false);
  const [imgFile, setImgFile] = useState(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLocal({ ...p, stock_qty: p.stock_qty == null ? -1 : p.stock_qty, brandNameText: p.brand || '' });
    setImgFile(null);
  }, [p.id]);

  useEffect(() => {
    if (!local.category_id) { setRowBrands([]); return; }
    adminFetch(`/api/admin/brands?category_id=${Number(local.category_id)}`)
      .then(d => setRowBrands(Array.isArray(d) ? d : []))
      .catch(() => setRowBrands([]));
  }, [local.category_id]);

  async function save() {
    setSaving(true);
    try {
      await adminFetch(`/api/admin/products/${p.id}`, { method: 'PUT', body: JSON.stringify(toPayload(local)) });
      onSaved();
    } catch (e) {
      alert(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function applyUploadedImage() {
    if (!imgFile) { alert('Выбери файл'); return; }
    setImgBusy(true);
    try {
      const { url } = await adminUpload(imgFile);
      const next = { ...local, image_url: url };
      setLocal(next);
      setImgFile(null);
      await adminFetch(`/api/admin/products/${p.id}`, { method: 'PUT', body: JSON.stringify(toPayload(next)) });
      onSaved();
    } catch (e) {
      alert(e?.message || 'Ошибка');
    } finally {
      setImgBusy(false);
    }
  }

  async function clearImage() {
    if (!window.confirm('Убрать фото товара?')) return;
    setSaving(true);
    try {
      const next = { ...local, image_url: null };
      await adminFetch(`/api/admin/products/${p.id}`, { method: 'PUT', body: JSON.stringify(toPayload(next)) });
      setLocal(next);
      onSaved();
    } catch (e) {
      alert(e?.message);
    } finally {
      setSaving(false);
    }
  }

  function onPickCategory(cid) {
    setLocal(s => ({
      ...s,
      category_id: Number(cid),
      brand_id: null,
      brandNameText: '',
    }));
  }
  function onPickBrand(bid) {
    const b = rowBrands.find(x => x.id === Number(bid));
    setLocal(s => ({
      ...s,
      brand_id: bid === '' || bid == null ? null : Number(bid),
      brandNameText: b ? b.name : '',
    }));
  }

  const set = (key) => (e) => setLocal((s) => ({ ...s, [key]: e.target.value }));

  return (
    <>
    <tr
      id={`admin-prod-${p.id}`}
      style={isHighlighted ? { outline: '2px solid rgba(255,45,45,0.4)', background: 'rgba(255,45,45,0.07)' } : undefined}
    >
      <td style={{ minWidth: 130 }}>
        {local.image_url ? (
          <div className="thumb"><img src={local.image_url} alt="" /></div>
        ) : <div className="thumb" />}
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input
            type="file"
            accept="image/*"
            className="input"
            style={{ padding: 4, fontSize: 11 }}
            onChange={e => setImgFile(e.target.files?.[0] || null)}
          />
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm" disabled={imgBusy} onClick={applyUploadedImage}>
              {imgBusy ? '…' : 'Заменить'}
            </button>
            {local.image_url && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={clearImage}>Сбросить</button>
            )}
          </div>
        </div>
      </td>
      <td>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 140 }}>
            <span className="label" style={{ fontSize: 11 }}>Категория</span>
            <select
              className="select"
              value={local.category_id != null ? String(local.category_id) : ''}
              onChange={e => onPickCategory(e.target.value)}
            >
              {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 130 }}>
            <span className="label" style={{ fontSize: 11 }}>Бренд</span>
            <select
              className="select"
              value={local.brand_id == null || local.brand_id === '' ? '' : String(local.brand_id)}
              onChange={e => onPickBrand(e.target.value)}
            >
              <option value="">—</option>
              {rowBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
        <input className="input" value={local.name} onChange={e => setLocal(s => ({ ...s, name: e.target.value }))} style={{ minWidth: 160 }} />
        <div className="kbd" style={{ marginTop: 4 }}>id {p.id}</div>
      </td>
      <td>
        <input className="input" type="number" title="Цена в белорусских рублях BYN" value={local.price} onChange={e => setLocal(s => ({ ...s, price: e.target.value }))} style={{ width: 88 }} />
      </td>
      <td>
        <input
          className="input"
          type="number"
          title="-1 = безлимит"
          value={local.stock_qty}
          onChange={e => setLocal(s => ({ ...s, stock_qty: e.target.value }))}
          style={{ width: 72 }}
        />
        <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>−1 безлимит</div>
      </td>
      <td>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={!!local.in_stock} onChange={e => setLocal(s => ({ ...s, in_stock: e.target.checked }))} />
          <span>вкл</span>
        </label>
      </td>
      <td>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={save}>{saving ? '…' : 'Сохранить'}</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Свернуть' : 'Ещё поля'}
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={onDelete}>Удалить</button>
        </div>
      </td>
    </tr>
    {expanded && (
      <tr className="row-extra">
        <td colSpan={6}>
          <div className="form-grid-2" style={{ maxWidth: 760 }}>
            <div className="field">
              <span className="label">Старая цена (для скидки)</span>
              <input className="input" type="number" value={local.old_price ?? ''} onChange={set('old_price')} placeholder="—" />
            </div>
            <div className="field">
              <span className="label">Порядок сортировки</span>
              <input className="input" type="number" value={local.sort_order ?? 0} onChange={set('sort_order')} />
            </div>
            <div className="field">
              <span className="label">Объём</span>
              <input className="input" value={local.volume ?? ''} onChange={set('volume')} placeholder="напр. 30 мл" />
            </div>
            <div className="field">
              <span className="label">Никотин</span>
              <input className="input" value={local.nicotine ?? ''} onChange={set('nicotine')} placeholder="напр. 20 мг" />
            </div>
            <div className="field span-2">
              <span className="label">Описание</span>
              <textarea className="textarea" value={local.description ?? ''} onChange={set('description')} placeholder="Описание товара для карточки" />
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={save} style={{ marginTop: 12 }}>
            {saving ? '…' : 'Сохранить изменения'}
          </button>
        </td>
      </tr>
    )}
    </>
  );
}

const EMPTY_PRODUCT = {
  category_id: '',
  brand_id: '',
  name: '',
  price: '',
  old_price: '',
  stock_qty: '-1',
  volume: '',
  nicotine: '',
  description: '',
  sort_order: '0',
  in_stock: true,
};

function NewProductForm({ categories, onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [brands, setBrands] = useState([]);
  const [imgFile, setImgFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((s) => ({ ...s, [key]: value }));
  };

  useEffect(() => {
    if (!form.category_id) { setBrands([]); return; }
    adminFetch(`/api/admin/brands?category_id=${Number(form.category_id)}`)
      .then((d) => setBrands(Array.isArray(d) ? d : []))
      .catch(() => setBrands([]));
  }, [form.category_id]);

  async function submit() {
    if (!form.category_id) { alert('Выбери категорию'); return; }
    if (!String(form.name).trim()) { alert('Введи название'); return; }
    if (form.price === '' || Number.isNaN(Number(form.price))) { alert('Укажи цену'); return; }
    setBusy(true);
    try {
      let imageUrl = null;
      if (imgFile) {
        const up = await adminUpload(imgFile);
        imageUrl = up?.url || null;
      }
      const brandId = form.brand_id === '' ? null : Number(form.brand_id);
      const brandName = brandId == null ? null : (brands.find((b) => b.id === brandId)?.name ?? null);
      const created = await adminFetch('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          category_id: Number(form.category_id),
          brand_id: brandId,
          brand: brandName,
          name: String(form.name).trim(),
          price: Number(form.price),
          old_price: form.old_price === '' ? null : Number(form.old_price),
          stock_qty: form.stock_qty === '' ? -1 : Number(form.stock_qty),
          volume: form.volume || null,
          nicotine: form.nicotine || null,
          description: form.description || null,
          sort_order: Number(form.sort_order || 0),
          in_stock: !!form.in_stock,
          image_url: imageUrl,
        }),
      });
      setForm(EMPTY_PRODUCT);
      setImgFile(null);
      setOpen(false);
      onCreated(created?.id);
    } catch (e) {
      alert(e?.message || 'Не удалось создать товар');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
        + Добавить товар
      </button>
    );
  }

  return (
    <div className="form-block" style={{ maxWidth: 900, marginTop: 12, border: '1px solid rgba(var(--accent-rgb),0.25)' }}>
      <h4>Новый товар</h4>
      <div className="form-grid-2">
        <div className="field">
          <span className="label">Категория *</span>
          <select className="select" value={form.category_id} onChange={set('category_id')}>
            <option value="">— выбрать —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <span className="label">Бренд</span>
          <select className="select" value={form.brand_id} onChange={set('brand_id')} disabled={!form.category_id}>
            <option value="">—</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="field span-2">
          <span className="label">Название *</span>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Например: HQD Cuvie · Манго" />
        </div>
        <div className="field">
          <span className="label">Цена, BYN *</span>
          <input className="input" type="number" value={form.price} onChange={set('price')} placeholder="0.00" />
        </div>
        <div className="field">
          <span className="label">Старая цена</span>
          <input className="input" type="number" value={form.old_price} onChange={set('old_price')} placeholder="—" />
        </div>
        <div className="field">
          <span className="label">Остаток (−1 безлимит)</span>
          <input className="input" type="number" value={form.stock_qty} onChange={set('stock_qty')} />
        </div>
        <div className="field">
          <span className="label">Порядок</span>
          <input className="input" type="number" value={form.sort_order} onChange={set('sort_order')} />
        </div>
        <div className="field">
          <span className="label">Объём</span>
          <input className="input" value={form.volume} onChange={set('volume')} placeholder="напр. 30 мл" />
        </div>
        <div className="field">
          <span className="label">Никотин</span>
          <input className="input" value={form.nicotine} onChange={set('nicotine')} placeholder="напр. 20 мг" />
        </div>
        <div className="field span-2">
          <span className="label">Описание</span>
          <textarea className="textarea" value={form.description} onChange={set('description')} />
        </div>
        <div className="field">
          <span className="label">Фото</span>
          <input type="file" accept="image/*" className="input" style={{ padding: 6 }} onChange={(e) => setImgFile(e.target.files?.[0] || null)} />
        </div>
        <div className="field">
          <span className="label">Наличие</span>
          <label className="row" style={{ gap: 8, marginTop: 6 }}>
            <input type="checkbox" checked={!!form.in_stock} onChange={set('in_stock')} />
            <span>Показывать в магазине</span>
          </label>
        </div>
      </div>
      <div className="row" style={{ marginTop: 14, gap: 8 }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? 'Создаём…' : 'Создать товар'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setOpen(false); setForm(EMPTY_PRODUCT); setImgFile(null); }}>
          Отмена
        </button>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [q, setQ] = useState(() => searchParams.get('q') || '');
  const [debounced, setDebounced] = useState(() => (searchParams.get('q') || '').trim());
  const [catId, setCatId] = useState(() => searchParams.get('category_id') || '');
  const [brandId, setBrandId] = useState(() => searchParams.get('brand_id') || '');
  /** Подсветка строки при переходе с «Витрины»; сбрасывается при смене поиска/фильтров */
  const [rowHighlight, setRowHighlight] = useState(() => searchParams.get('highlight') || '');

  const [list, setList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [metaReady, setMetaReady] = useState(false);
  const [filterBrands, setFilterBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!catId) {
      setFilterBrands([]);
      return;
    }
    adminFetch(`/api/admin/brands?category_id=${Number(catId)}`)
      .then(d => setFilterBrands(Array.isArray(d) ? d : []))
      .catch(() => setFilterBrands([]));
  }, [catId]);

  function load() {
    setLoading(true);
    const p = new URLSearchParams();
    if (debounced) p.set('q', debounced);
    if (catId) p.set('category_id', catId);
    if (brandId) p.set('brand_id', brandId);
    const apiQs = p.toString();
    adminFetch(`/api/admin/products${apiQs ? `?${apiQs}` : ''}`)
      .then(data => { setList(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setList([]); setLoading(false); });
  }

  useEffect(() => { load(); }, [debounced, catId, brandId]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (debounced) p.set('q', debounced);
    if (catId) p.set('category_id', catId);
    if (brandId) p.set('brand_id', brandId);
    if (rowHighlight) p.set('highlight', rowHighlight);
    setSearchParams(p, { replace: true });
  }, [debounced, catId, brandId, rowHighlight, setSearchParams]);

  useEffect(() => {
    adminFetch('/api/admin/categories')
      .then(d => { setCategories(Array.isArray(d) ? d : []); })
      .catch(() => { setCategories([]); })
      .finally(() => { setMetaReady(true); });
  }, []);

  useEffect(() => {
    if (loading || !metaReady || !rowHighlight) return;
    const el = document.getElementById(`admin-prod-${rowHighlight}`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [loading, metaReady, rowHighlight, list.length]);

  return (
    <>
      <h1 className="h1">Товары</h1>
      <p className="muted">Поиск и фильтры дублируются в адресной строке (можно поделиться ссылкой). Цены храните в <b>BYN</b> (белорусский рубль). Остаток: <b>−1</b> = безлимит, <b>0</b> = нет. Кнопка «Ещё поля» в строке открывает редактирование описания, объёма, никотина и скидки.</p>

      <NewProductForm
        categories={categories}
        onCreated={(newId) => {
          setQ('');
          setDebounced('');
          setCatId('');
          setBrandId('');
          if (newId) setRowHighlight(String(newId));
          load();
        }}
      />

      <div className="form-block" style={{ maxWidth: 900, marginTop: 12 }}>
        <div className="form-grid-2">
          <div className="field span-2">
            <span className="label">Поиск</span>
            <input
              className="input"
              value={q}
              onChange={e => { setRowHighlight(''); setQ(e.target.value); }}
              placeholder="Название, бренд в карточке, описание…"
            />
          </div>
          <div className="field">
            <span className="label">Категория</span>
            <select
              className="select"
              value={catId}
              onChange={e => { setRowHighlight(''); setCatId(e.target.value); setBrandId(''); }}
            >
              <option value="">Все</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="label">Бренд</span>
            <select
              className="select"
              value={brandId}
              onChange={e => { setRowHighlight(''); setBrandId(e.target.value); }}
              disabled={!catId}
            >
              <option value="">Все</option>
              {filterBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
        <button type="button" className="btn" onClick={load} style={{ marginTop: 10 }}>Обновить список</button>
      </div>

      <div className="card">
        {loading || !metaReady ? <p className="muted">Загрузка…</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Фото</th>
                  <th>Категория / бренд / название</th>
                  <th>Цена (BYN)</th>
                  <th>Остаток</th>
                  <th>Наличие</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map(p => (
                  <Row
                    key={p.id}
                    p={p}
                    categories={categories}
                    isHighlighted={String(p.id) === String(rowHighlight)}
                    onSaved={load}
                    onDelete={async () => {
                      if (!window.confirm(`Удалить «${p.name}»?`)) return;
                      try {
                        await adminFetch(`/api/admin/products/${p.id}`, { method: 'DELETE' });
                        load();
                      } catch (e) {
                        alert(e?.message);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
            {list.length === 0 && <p className="muted" style={{ padding: 8 }}>Нет товаров</p>}
          </div>
        )}
      </div>
    </>
  );
}
