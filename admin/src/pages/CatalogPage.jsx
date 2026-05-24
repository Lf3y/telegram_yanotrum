import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminFetch, adminUpload } from '../lib/api';
import { resolveMediaUrl } from '../lib/media';
import ImageUploadField from '../components/ImageUploadField';
import { formatByn } from '../lib/money';

function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s_-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'item';
}

function Thumb({ url }) {
  const src = resolveMediaUrl(url);
  if (!src) return <div className="thumb" />;
  return <div className="thumb"><img src={src} alt="" loading="lazy" /></div>;
}

/** @param {Record<string, unknown>} category */
function categoryPayload(category) {
  return {
    name: String(category.name || '').trim(),
    slug: (String(category.slug || '').trim() || slugify(category.name)).trim(),
    emoji: String(category.emoji || '').trim() || '🛍',
    description: category.description != null ? String(category.description).trim() || null : null,
    sort_order: (() => {
      const n = Number(category.sort_order);
      return Number.isFinite(n) ? n : 0;
    })(),
    image_url: category.image_url != null && String(category.image_url).trim()
      ? String(category.image_url).trim()
      : null,
  };
}

/** @param {Record<string, unknown>} brand */
function brandPayload(brand) {
  return {
    category_id: Number(brand.category_id),
    name: String(brand.name || '').trim(),
    slug: (String(brand.slug || '').trim() || slugify(brand.name)).trim(),
    image_url: brand.image_url != null && String(brand.image_url).trim()
      ? String(brand.image_url).trim()
      : null,
    sort_order: Number(brand.sort_order || 0),
  };
}

const TABS = [
  { id: 'categories', label: 'Категории', step: '1' },
  { id: 'brands', label: 'Бренды', step: '2' },
  { id: 'products', label: 'Товары', step: '3' },
];

export default function CatalogPage() {
  const [tab, setTab] = useState('categories');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [activeCat, setActiveCat] = useState('');
  const [activeBrand, setActiveBrand] = useState('');

  const [newCat, setNewCat] = useState({ name: '', slug: '', emoji: '🛍', description: '', image_url: '' });
  const [newBrand, setNewBrand] = useState({ name: '', slug: '', image_url: '' });
  const [newProd, setNewProd] = useState({ name: '', price: '', volume: '', nicotine: '', description: '', image_url: '', stock_qty: '-1' });
  const [fileCat, setFileCat] = useState(null);
  const [fileBrand, setFileBrand] = useState(null);
  const [fileProd, setFileProd] = useState(null);
  const [up, setUp] = useState({ c: false, b: false, p: false, ec: false, eb: false });
  const [searchCat, setSearchCat] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [fileEditCat, setFileEditCat] = useState(null);
  const [searchBrand, setSearchBrand] = useState('');
  const [editingBrand, setEditingBrand] = useState(null);
  const [fileEditBrand, setFileEditBrand] = useState(null);
  const [prodQ, setProdQ] = useState('');
  const [prodQDeb, setProdQDeb] = useState('');
  const [prodList, setProdList] = useState([]);
  const [prodListLoading, setProdListLoading] = useState(false);
  /** сбрасывается после успешного POST товара, чтобы сразу увидеть его в «Найденных» */
  const [prodListVersion, setProdListVersion] = useState(0);

  const navigate = useNavigate();
  const currentCat = useMemo(() => categories.find(c => String(c.id) === String(activeCat)), [categories, activeCat]);

  async function reloadCategories() {
    setError('');
    const cats = await adminFetch('/api/admin/categories');
    setCategories(Array.isArray(cats) ? cats : []);
  }

  useEffect(() => { reloadCategories().catch(e => setError(e?.message || 'Ошибка')); }, []);

  useEffect(() => {
    const t = setTimeout(() => setProdQDeb(prodQ.trim()), 300);
    return () => clearTimeout(t);
  }, [prodQ]);

  useEffect(() => {
    if (tab !== 'products') return;
    setProdListLoading(true);
    setError('');
    const p = new URLSearchParams();
    if (prodQDeb) p.set('q', prodQDeb);
    if (activeCat) p.set('category_id', activeCat);
    if (activeBrand) p.set('brand_id', activeBrand);
    const qs = p.toString();
    adminFetch(`/api/admin/products${qs ? `?${qs}` : ''}`)
      .then(d => { setProdList(Array.isArray(d) ? d : []); setProdListLoading(false); })
      .catch(() => { setProdList([]); setProdListLoading(false); });
  }, [tab, prodQDeb, activeCat, activeBrand, prodListVersion]);

  useEffect(() => {
    if (!activeCat) { setBrands([]); return; }
    adminFetch(`/api/admin/brands?category_id=${activeCat}`)
      .then(b => setBrands(Array.isArray(b) ? b : []))
      .catch(() => setBrands([]));
  }, [activeCat]);

  const filteredCategories = useMemo(() => {
    const s = searchCat.trim().toLowerCase();
    if (!s) return categories;
    return categories.filter(c =>
      String(c.name).toLowerCase().includes(s)
      || String(c.slug || '').toLowerCase().includes(s)
      || String(c.id) === s
    );
  }, [categories, searchCat]);

  const filteredBrands = useMemo(() => {
    const s = searchBrand.trim().toLowerCase();
    if (!s) return brands;
    return brands.filter(b =>
      String(b.name).toLowerCase().includes(s)
      || String(b.slug || '').toLowerCase().includes(s)
      || String(b.id) === s
    );
  }, [brands, searchBrand]);

  async function doUpload(file, which) {
    if (!file) { setError('Выбери файл'); return; }
    setError('');
    setSuccess('');
    setUp(s => ({ ...s, [which]: true }));
    try {
      const r = await adminUpload(file);
      const url = r?.url ? String(r.url) : '';
      if (!url) throw new Error('Сервер не вернул URL картинки');

      if (which === 'c') {
        setNewCat(s => ({ ...s, image_url: url }));
        setSuccess('Фото загружено. Нажми «Добавить категорию», чтобы сохранить.');
      }
      if (which === 'b') {
        setNewBrand(s => ({ ...s, image_url: url }));
        setSuccess('Фото загружено. Нажми «Добавить бренд», чтобы сохранить.');
      }
      if (which === 'p') {
        setNewProd(s => ({ ...s, image_url: url }));
        setSuccess('Фото загружено. Нажми «Добавить товар», чтобы сохранить.');
      }

      if (which === 'ec' && editingCategory?.id) {
        const saved = await adminFetch(`/api/admin/categories/${editingCategory.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...categoryPayload(editingCategory), image_url: url }),
        });
        setEditingCategory(saved);
        await reloadCategories();
        setSuccess(`Картинка категории «${saved.name}» сохранена`);
        setFileEditCat(null);
      } else if (which === 'ec') {
        setEditingCategory(s => (s ? { ...s, image_url: url } : s));
      }

      if (which === 'eb' && editingBrand?.id) {
        const saved = await adminFetch(`/api/admin/brands/${editingBrand.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...brandPayload(editingBrand), image_url: url }),
        });
        setEditingBrand(saved);
        await reloadBrandsForCat();
        setSuccess(`Картинка бренда «${saved.name}» сохранена`);
        setFileEditBrand(null);
      } else if (which === 'eb') {
        setEditingBrand(s => (s ? { ...s, image_url: url } : s));
      }
    } catch (e) {
      setError(e?.message || 'Ошибка загрузки');
    } finally {
      setUp(s => ({ ...s, [which]: false }));
    }
  }

  async function reloadBrandsForCat() {
    if (!activeCat) return;
    const bs = await adminFetch(`/api/admin/brands?category_id=${activeCat}`);
    setBrands(Array.isArray(bs) ? bs : []);
  }

  return (
    <>
      <h1 className="h1">Витрина</h1>
      <p className="muted" style={{ marginBottom: 0 }}>Добавление категорий, брендов и товаров — по шагам, без кучи полей на одном экране.</p>

      <div className="catalog-nav" role="tablist" aria-label="Разделы витрины">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`catalog-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="step-num">{t.step}</span>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="card" style={{ marginTop: 14, borderColor: 'rgba(255,45,45,0.3)', background: 'rgba(255,45,45,0.08)' }}>{error}</div>
      )}
      {success && (
        <div className="card" style={{ marginTop: 14, borderColor: 'rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.1)' }}>{success}</div>
      )}

      {/* ——— Категории ——— */}
      {tab === 'categories' && (
        <div className="list-panel">
          <p className="section-hint" style={{ marginTop: 16 }}>
            Разделы магазина на главной. У существующей категории: <strong>Изменить</strong> → выбери файл → <strong>Загрузить</strong> (сохранится сразу).
          </p>

          <div className="form-panel">
            <div className="form-block">
              <h4>Новая категория</h4>
              <div className="form-grid-2 stack-gap">
                <div className="field span-2">
                  <span className="label">Название</span>
                  <input className="input" value={newCat.name} onChange={e => setNewCat(s => ({ ...s, name: e.target.value, slug: s.slug || slugify(e.target.value) }))} placeholder="Например: Жидкости" />
                </div>
                <div className="field">
                  <span className="label">Slug (код в ссылке)</span>
                  <input className="input" value={newCat.slug} onChange={e => setNewCat(s => ({ ...s, slug: e.target.value }))} placeholder="liquids" />
                </div>
                <div className="field">
                  <span className="label">Emoji</span>
                  <input className="input" value={newCat.emoji} onChange={e => setNewCat(s => ({ ...s, emoji: e.target.value }))} maxLength={4} />
                </div>
                <ImageUploadField
                  label="Картинка (только загрузка файла)"
                  previewUrl={newCat.image_url}
                  file={fileCat}
                  onFileChange={setFileCat}
                  onUpload={() => doUpload(fileCat, 'c')}
                  onClear={() => { setFileCat(null); setNewCat(s => ({ ...s, image_url: '' })); }}
                  busy={up.c}
                />
                <div className="field span-2">
                  <span className="label">Описание</span>
                  <textarea className="textarea" value={newCat.description} onChange={e => setNewCat(s => ({ ...s, description: e.target.value }))} placeholder="Коротко для карточки на главной" />
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 16, width: '100%', maxWidth: 320 }}
                onClick={async () => {
                  try {
                    await adminFetch('/api/admin/categories', {
                      method: 'POST',
                      body: JSON.stringify(categoryPayload(newCat)),
                    });
                    setNewCat({ name: '', slug: '', emoji: '🛍', description: '', image_url: '' });
                    setFileCat(null);
                    setSuccess('Категория добавлена');
                    await reloadCategories();
                  } catch (e) { setError(e?.message); }
                }}
              >Добавить категорию</button>
            </div>
          </div>

          {editingCategory && (
            <div className="form-block" style={{ marginTop: 16, maxWidth: 720, border: '1px solid rgba(var(--accent-rgb),0.25)' }}>
              <h4>Редактирование · id {editingCategory.id}</h4>
              <div className="form-grid-2">
                <div className="field span-2">
                  <span className="label">Название</span>
                  <input className="input" value={editingCategory.name || ''} onChange={e => setEditingCategory(s => ({ ...s, name: e.target.value }))} />
                </div>
                <div className="field">
                  <span className="label">Slug</span>
                  <input className="input" value={editingCategory.slug || ''} onChange={e => setEditingCategory(s => ({ ...s, slug: e.target.value }))} />
                </div>
                <div className="field">
                  <span className="label">Порядок</span>
                  <input className="input" type="number" value={editingCategory.sort_order ?? 0} onChange={e => setEditingCategory(s => ({ ...s, sort_order: e.target.value }))} />
                </div>
                <div className="field">
                  <span className="label">Emoji</span>
                  <input className="input" value={editingCategory.emoji || ''} onChange={e => setEditingCategory(s => ({ ...s, emoji: e.target.value }))} maxLength={4} />
                </div>
                <ImageUploadField
                  label="Картинка"
                  previewUrl={editingCategory.image_url}
                  file={fileEditCat}
                  onFileChange={setFileEditCat}
                  onUpload={() => doUpload(fileEditCat, 'ec')}
                  onClear={() => { setFileEditCat(null); setEditingCategory(s => (s ? { ...s, image_url: '' } : s)); }}
                  busy={up.ec}
                />
                <div className="field span-2">
                  <span className="label">Описание</span>
                  <textarea className="textarea" value={editingCategory.description || ''} onChange={e => setEditingCategory(s => ({ ...s, description: e.target.value }))} />
                </div>
              </div>
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    try {
                      await adminFetch(`/api/admin/categories/${editingCategory.id}`, {
                        method: 'PUT',
                        body: JSON.stringify(categoryPayload(editingCategory)),
                      });
                      setEditingCategory(null);
                      setFileEditCat(null);
                      setSuccess('Категория сохранена');
                      await reloadCategories();
                    } catch (e) { setError(e?.message); }
                  }}
                >Сохранить</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setEditingCategory(null); setFileEditCat(null); }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 20 }}>
            <h3 style={{ marginBottom: 4 }}>Все категории</h3>
            <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>Удаление — только если в категории нет товаров.</p>
            <div className="field" style={{ maxWidth: 400, marginBottom: 12 }}>
              <span className="label">Поиск в списке</span>
              <input className="input" value={searchCat} onChange={e => setSearchCat(e.target.value)} placeholder="Название, slug, id" />
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Фото</th>
                    <th>Название</th>
                    <th>slug</th>
                    <th style={{ minWidth: 180 }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map(c => (
                    <tr key={c.id}>
                      <td><Thumb url={c.image_url} /></td>
                      <td>
                        <div style={{ fontWeight: 800 }}>{c.emoji} {c.name}</div>
                        <div className="kbd">id {c.id}</div>
                      </td>
                      <td className="kbd">{c.slug}</td>
                      <td>
                        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => { setEditingCategory({ ...c }); setFileEditCat(null); }}>Изменить</button>
                          <button type="button" className="btn btn-sm" onClick={() => { setActiveCat(String(c.id)); setTab('brands'); }}>Бренды →</button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={async () => {
                              if (!window.confirm('Удалить категорию вместе со всеми товарами и брендами внутри?')) return;
                              try { await adminFetch(`/api/admin/categories/${c.id}`, { method: 'DELETE' }); await reloadCategories(); if (String(activeCat) === String(c.id)) setActiveCat(''); } catch (e) { setError(e?.message); }
                            }}
                          >Удалить</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {categories.length === 0 && <p className="muted">Пока нет категорий</p>}
            {categories.length > 0 && filteredCategories.length === 0 && <p className="muted">Ничего не найдено — смени поиск</p>}
          </div>
        </div>
      )}

      {/* ——— Бренды ——— */}
      {tab === 'brands' && (
        <div className="list-panel">
          <p className="section-hint" style={{ marginTop: 16 }}>
            Бренды привязаны к категории. В витрине сначала выбирают категорию, потом бренд, потом товары.
          </p>

          <div className="form-block" style={{ marginTop: 14, maxWidth: 720 }}>
            <h4 style={{ border: 'none', padding: 0, marginBottom: 8 }}>Выбор категории</h4>
            <div className="field" style={{ maxWidth: 400 }}>
              <span className="label">Категория</span>
              <select className="select" value={activeCat} onChange={e => { setActiveCat(e.target.value); setActiveBrand(''); }}>
                <option value="">Выбери категорию</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </div>
            {currentCat && <p className="muted" style={{ marginTop: 8 }}>Работаем с: <strong>{currentCat.name}</strong></p>}
          </div>

          {!activeCat ? (
            <div className="card" style={{ marginTop: 16 }}>
              <p className="muted" style={{ margin: 0 }}>Сначала выбери категорию выше — тогда откроется форма бренда и список.</p>
            </div>
          ) : (
            <>
              <div className="form-panel form-block" style={{ maxWidth: 720, marginTop: 0 }}>
                <h4>Новый бренд</h4>
                <div className="form-grid-2">
                  <div className="field">
                    <span className="label">Название</span>
                    <input className="input" value={newBrand.name} onChange={e => setNewBrand(s => ({ ...s, name: e.target.value, slug: s.slug || slugify(e.target.value) }))} placeholder="Например: BLVK" />
                  </div>
                  <div className="field">
                    <span className="label">Slug</span>
                    <input className="input" value={newBrand.slug} onChange={e => setNewBrand(s => ({ ...s, slug: e.target.value }))} />
                  </div>
                  <ImageUploadField
                    label="Картинка (только загрузка файла)"
                    previewUrl={newBrand.image_url}
                    file={fileBrand}
                    onFileChange={setFileBrand}
                    onUpload={() => doUpload(fileBrand, 'b')}
                    onClear={() => { setFileBrand(null); setNewBrand(s => ({ ...s, image_url: '' })); }}
                    busy={up.b}
                    disabled={!activeCat}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: 16, width: '100%', maxWidth: 320 }}
                  onClick={async () => {
                    try {
                      await adminFetch('/api/admin/brands', {
                        method: 'POST',
                        body: JSON.stringify({
                          category_id: Number(activeCat),
                          name: newBrand.name.trim(),
                          slug: (newBrand.slug || slugify(newBrand.name)).trim(),
                          image_url: newBrand.image_url?.trim() || null,
                          sort_order: 0,
                        }),
                      });
                      setNewBrand({ name: '', slug: '', image_url: '' });
                      await reloadBrandsForCat();
                    } catch (e) { setError(e?.message); }
                  }}
                >Добавить бренд</button>
              </div>

              {editingBrand && (
                <div className="form-block" style={{ maxWidth: 720, border: '1px solid rgba(var(--accent-rgb),0.25)' }}>
                  <h4>Редактирование бренда · id {editingBrand.id}</h4>
                  <div className="form-grid-2">
                    <div className="field span-2">
                      <span className="label">Перенести в категорию</span>
                      <select
                        className="select"
                        value={editingBrand.category_id}
                        onChange={e => setEditingBrand(s => ({ ...s, category_id: Number(e.target.value) }))}
                      >
                        {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <span className="label">Название</span>
                      <input className="input" value={editingBrand.name || ''} onChange={e => setEditingBrand(s => ({ ...s, name: e.target.value }))} />
                    </div>
                    <div className="field">
                      <span className="label">Slug</span>
                      <input className="input" value={editingBrand.slug || ''} onChange={e => setEditingBrand(s => ({ ...s, slug: e.target.value }))} />
                    </div>
                    <div className="field">
                      <span className="label">Порядок</span>
                      <input className="input" type="number" value={editingBrand.sort_order ?? 0} onChange={e => setEditingBrand(s => ({ ...s, sort_order: e.target.value }))} />
                    </div>
                    <ImageUploadField
                      label="Картинка"
                      previewUrl={editingBrand.image_url}
                      file={fileEditBrand}
                      onFileChange={setFileEditBrand}
                      onUpload={() => doUpload(fileEditBrand, 'eb')}
                      onClear={() => { setFileEditBrand(null); setEditingBrand(s => (s ? { ...s, image_url: '' } : s)); }}
                      busy={up.eb}
                    />
                  </div>
                  <div className="row" style={{ marginTop: 12, gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={async () => {
                        const savedCat = Number(editingBrand.category_id);
                        try {
                          await adminFetch(`/api/admin/brands/${editingBrand.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({
                              category_id: savedCat,
                              name: editingBrand.name?.trim(),
                              slug: (editingBrand.slug || slugify(editingBrand.name)).trim(),
                              image_url: editingBrand.image_url?.trim() || null,
                              sort_order: Number(editingBrand.sort_order || 0),
                            }),
                          });
                          setEditingBrand(null);
                          setFileEditBrand(null);
                          setActiveCat(String(savedCat));
                          const bs = await adminFetch(`/api/admin/brands?category_id=${savedCat}`);
                          setBrands(Array.isArray(bs) ? bs : []);
                        } catch (e) { setError(e?.message); }
                      }}
                    >Сохранить</button>
                    <button type="button" className="btn btn-ghost" onClick={() => { setEditingBrand(null); setFileEditBrand(null); }}>Отмена</button>
                  </div>
                </div>
              )}

              <div className="card" style={{ marginTop: 20, maxWidth: 900 }}>
                <h3 style={{ marginBottom: 4 }}>Бренды в «{currentCat.name}»</h3>
                <div className="field" style={{ maxWidth: 400, marginBottom: 12 }}>
                  <span className="label">Поиск в списке</span>
                  <input className="input" value={searchBrand} onChange={e => setSearchBrand(e.target.value)} placeholder="Название, slug, id" />
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Фото</th>
                        <th>Название</th>
                        <th>slug</th>
                        <th style={{ minWidth: 200 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBrands.map(b => (
                        <tr key={b.id} style={{ background: String(b.id) === String(activeBrand) ? 'rgba(var(--accent-rgb),0.06)' : undefined }}>
                          <td><Thumb url={b.image_url} /></td>
                          <td>
                            <div style={{ fontWeight: 800 }}>{b.name}</div>
                            <div className="kbd">id {b.id}</div>
                          </td>
                          <td className="kbd">{b.slug}</td>
                          <td>
                            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => { setEditingBrand({ ...b }); setFileEditBrand(null); }}
                              >Изменить</button>
                              <button type="button" className="btn btn-sm" onClick={() => { setActiveBrand(String(b.id)); setTab('products'); }}>Товары →</button>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                onClick={async () => {
                                  if (!window.confirm(`Удалить бренд «${b.name}» вместе со всеми его товарами?`)) return;
                                  try {
                                    await adminFetch(`/api/admin/brands/${b.id}`, { method: 'DELETE' });
                                    if (String(activeBrand) === String(b.id)) setActiveBrand('');
                                    await reloadBrandsForCat();
                                  } catch (e) { setError(e?.message); }
                                }}
                              >Удалить</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {brands.length === 0 && <p className="muted">В этой категории брендов пока нет</p>}
                {brands.length > 0 && filteredBrands.length === 0 && <p className="muted">Ничего не найдено</p>}
              </div>
            </>
          )}
        </div>
      )}

      {/* ——— Товары ——— */}
      {tab === 'products' && (
        <div className="list-panel">
          <p className="section-hint" style={{ marginTop: 16 }}>
            Фильтруй по категории/бренду, ищи по названию. Список ниже — для быстрого поиска; детальное редактирование (цена, остаток, фото) в разделе <strong>«Товары»</strong> в меню. Остаток при добавлении: <code>-1</code> = безлимит.
          </p>

          <div className="form-block" style={{ maxWidth: 800 }}>
            <h4 style={{ border: 'none', padding: 0, marginBottom: 10 }}>Фильтр и поиск</h4>
            <div className="form-grid-2">
              <div className="field">
                <span className="label">Категория</span>
                <select className="select" value={activeCat} onChange={e => { setActiveCat(e.target.value); setActiveBrand(''); }}>
                  <option value="">Все</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <span className="label">Бренд</span>
                <select className="select" value={activeBrand} onChange={e => setActiveBrand(e.target.value)} disabled={!activeCat}>
                  <option value="">Все / без фильтра</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="field span-2">
                <span className="label">Поиск товаров</span>
                <input className="input" value={prodQ} onChange={e => setProdQ(e.target.value)} placeholder="Название, описание, бренд в карточке…" />
              </div>
            </div>
          </div>

          <div className="card" style={{ maxWidth: 900 }}>
            <h3 style={{ marginTop: 0 }}>Найденные товары</h3>
            {prodListLoading ? (
              <p className="muted">Загрузка…</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>id</th>
                      <th>Название</th>
                      <th>Цена</th>
                      <th style={{ minWidth: 200 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {prodList.map(p => (
                      <tr key={p.id}>
                        <td className="kbd">{p.id}</td>
                        <td style={{ fontWeight: 700 }}>{p.name}</td>
                        <td>{formatByn(p.price)}</td>
                        <td>
                          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => {
                                const q = new URLSearchParams();
                                q.set('highlight', String(p.id));
                                q.set('q', p.name);
                                if (p.category_id) q.set('category_id', String(p.category_id));
                                if (p.brand_id) q.set('brand_id', String(p.brand_id));
                                navigate(`/products?${q.toString()}`);
                              }}
                            >Правка в «Товары»</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {prodList.length === 0 && <p className="muted" style={{ padding: 4 }}>Нет совпадений — смени поиск или фильтр</p>}
              </div>
            )}
          </div>

          <div className="form-block" style={{ maxWidth: 800, marginTop: 16 }}>
            <h4>Новый товар</h4>
            <p className="muted" style={{ marginTop: 0 }}>Категория обязательна. Для привязки к бренду сначала выбери категорию, потом бренд.</p>
            <div className="form-grid-2" style={{ marginBottom: 12 }}>
              <div className="field">
                <span className="label">Категория</span>
                <select
                  className="select"
                  value={activeCat}
                  onChange={e => { setActiveCat(e.target.value); setActiveBrand(''); }}
                >
                  <option value="">— выбери —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <span className="label">Бренд (необяз.)</span>
                <select className="select" value={activeBrand} onChange={e => setActiveBrand(e.target.value)} disabled={!activeCat}>
                  <option value="">Без бренда</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-grid-2">
              <div className="field span-2">
                <span className="label">Название</span>
                <input className="input" value={newProd.name} onChange={e => setNewProd(s => ({ ...s, name: e.target.value }))} />
              </div>
              <div className="field">
                <span className="label">Цена (BYN)</span>
                <input className="input" value={newProd.price} onChange={e => setNewProd(s => ({ ...s, price: e.target.value }))} inputMode="decimal" />
              </div>
              <div className="field">
                <span className="label">Остаток (шт.)</span>
                <input className="input" value={newProd.stock_qty} onChange={e => setNewProd(s => ({ ...s, stock_qty: e.target.value }))} title="−1 безлимит" />
              </div>
              <div className="field">
                <span className="label">Объём</span>
                <input className="input" value={newProd.volume} onChange={e => setNewProd(s => ({ ...s, volume: e.target.value }))} placeholder="60 ml" />
              </div>
              <div className="field">
                <span className="label">Никотин</span>
                <input className="input" value={newProd.nicotine} onChange={e => setNewProd(s => ({ ...s, nicotine: e.target.value }))} placeholder="3 мг" />
              </div>
              <ImageUploadField
                label="Картинка (только загрузка файла)"
                previewUrl={newProd.image_url}
                file={fileProd}
                onFileChange={setFileProd}
                onUpload={() => doUpload(fileProd, 'p')}
                onClear={() => { setFileProd(null); setNewProd(s => ({ ...s, image_url: '' })); }}
                busy={up.p}
              />
              <div className="field span-2">
                <span className="label">Описание</span>
                <textarea className="textarea" value={newProd.description} onChange={e => setNewProd(s => ({ ...s, description: e.target.value }))} />
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 16, maxWidth: 360, width: '100%' }}
              disabled={!activeCat || !newProd.name.trim() || newProd.price === ''}
              onClick={async () => {
                const price = Number(String(newProd.price).replace(',', '.'));
                if (!Number.isFinite(price)) { setError('Некорректная цена'); return; }
                const sq = newProd.stock_qty === '' || newProd.stock_qty === undefined ? -1 : Number(newProd.stock_qty);
                try {
                  await adminFetch('/api/admin/products', {
                    method: 'POST',
                    body: JSON.stringify({
                      category_id: Number(activeCat),
                      brand_id: activeBrand ? Number(activeBrand) : null,
                      name: newProd.name.trim(),
                      description: newProd.description?.trim() || null,
                      price,
                      old_price: null,
                      volume: newProd.volume?.trim() || null,
                      nicotine: newProd.nicotine?.trim() || null,
                      in_stock: 1,
                      sort_order: 0,
                      image_url: newProd.image_url?.trim() || null,
                      stock_qty: Number.isFinite(sq) ? sq : -1,
                    }),
                  });
                  setNewProd({ name: '', price: '', volume: '', nicotine: '', description: '', image_url: '', stock_qty: '-1' });
                  setFileProd(null);
                  setProdListVersion(v => v + 1);
                } catch (e) { setError(e?.message); }
              }}
            >Добавить товар</button>
          </div>
        </div>
      )}
    </>
  );
}
