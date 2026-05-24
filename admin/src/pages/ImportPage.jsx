import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminImportProducts } from '../lib/api';

export default function ImportPage() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [forcePartial, setForcePartial] = useState(false);
  const [replaceAll, setReplaceAll] = useState(true);

  async function doPreview() {
    setErr('');
    setResult(null);
    if (!file) {
      setErr('Выберите файл');
      return;
    }
    setBusy(true);
    try {
      const r = await adminImportProducts(file, { dryRun: true, replaceAll });
      setResult(r);
    } catch (e) {
      setErr(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setErr('');
    setResult(null);
    if (!file) {
      setErr('Выберите файл');
      return;
    }
    setBusy(true);
    try {
      const r = await adminImportProducts(file, { dryRun: false, force: forcePartial, replaceAll });
      setResult(r);
      if (r.aborted) {
        setErr(r.message || 'Импорт не выполнен: есть ошибки в файле. Сначала «Проверить».');
      }
    } catch (e) {
      setErr(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="h1">Импорт из Excel / CSV</h1>
      <p className="muted" style={{ maxWidth: 880 }}>
        Первая строка — <strong>заголовки колонок</strong>, далее по одному товару на строку. Читается{' '}
        <strong>первый лист</strong> книги Excel. Категории и бренды сохраняются; при включённой замене все старые товары удаляются перед импортом.
        Колонка <strong>«Объем, Никотин»</strong> (через запятую) разбивается на объём и крепость автоматически.
      </p>

      <div className="card" style={{ marginTop: 16, maxWidth: 960 }}>
        <h3 style={{ marginTop: 0 }}>Как назвать колонки</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Подойдут русские или английские заголовки (регистр не важен). Обязательны три поля:{' '}
          <strong>Категория</strong>, <strong>Название</strong>, <strong>Цена</strong> (BYN).
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>В Excel (пример)</th>
                <th>Обязательно</th>
                <th>Зачем</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="kbd">Категория</td>
                <td>Да</td>
                <td>

                  Жидкости / Одноразки / Снюс / POD — любое имя.
                  Если такой категории нет, она появится (emoji 📦 или из колонки «Emoji категории» для новых строк).
                </td>
              </tr>
              <tr>
                <td className="kbd">Бренд</td>
                <td>Нет</td>
                <td>В подборку фильтров магазина; при новом имени бренда запись создаётся в этой категории.</td>
              </tr>
              <tr>
                <td className="kbd">Название</td>
                <td>Да</td>
                <td>Название товара.</td>
              </tr>
              <tr>
                <td className="kbd">Цена</td>
                <td>Да</td>
                <td>Число в BYN; допустимы «12,50» или «12.5».</td>
              </tr>
              <tr>
                <td className="kbd">Старая цена</td>
                <td>Нет</td>
                <td>Старайтесь добавлять колонку только если нужна зачёркнутая цена в витрине.</td>
              </tr>
              <tr>
                <td className="kbd">Объем, Никотин</td>
                <td>Нет</td>
                <td>Одна колонка через запятую, например «60ml, 3мг» — разбивается на объём и никотин.</td>
              </tr>
              <tr>
                <td className="kbd">Остаток</td>
                <td>Нет</td>
                <td>Пусто или −1 → без учёта остатка. 0 → нет в наличии.</td>
              </tr>
              <tr>
                <td className="kbd">Описание / Фото (URL)</td>
                <td>Нет</td>
                <td>
                  Если колонку не добавите — поле при обновлении старого товара не трогаем; если колонка есть и ячейка пустая — можно обнулить.
                </td>
              </tr>
              <tr>
                <td className="kbd">Emoji категории / Описание категории / Порядок категории</td>
                <td>Нет</td>
                <td>Учитываются при <strong>создании</strong> новой категории из файла.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, maxWidth: 640 }}>
        <h3 style={{ marginTop: 0 }}>Файл</h3>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null); setErr(''); }}
        />
        <div className="row" style={{ marginTop: 12, flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={replaceAll} disabled={busy} onChange={e => setReplaceAll(e.target.checked)} />
            <span style={{ fontSize: 14 }}>Заменить все товары (удалить старые перед импортом, категории и бренды оставить)</span>
          </label>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={forcePartial} disabled={busy} onChange={e => setForcePartial(e.target.checked)} />
            <span style={{ fontSize: 14 }}>Есть битые строки — всё равно импортировать только безошибочные</span>
          </label>
        </div>
        <div className="row" style={{ marginTop: 16, gap: 10 }}>
          <button type="button" className="btn" disabled={busy} onClick={doPreview}>Проверить (без записи)</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={doImport}>Импортировать</button>
          <Link to="/products" className="btn" style={{ textAlign: 'center' }}>К списку товаров</Link>
        </div>
      </div>

      {err && (
        <div className="card" style={{ marginTop: 16, borderColor: 'rgba(255,45,45,0.35)', background: 'rgba(255,45,45,0.08)' }}>
          {err}
        </div>
      )}

      {result && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Ответ сервера</h3>
          {result.error && <p>{result.error}</p>}
          {result.aborted && <p>{result.message}</p>}
          {result.mappedFields?.length ? (
            <p className="muted">
              Распознанные колонки: <span className="kbd">{result.mappedFields.join(', ')}</span>

            </p>
          ) : null}
          {result.stats && (
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>
              {JSON.stringify(result.stats, null, 2)}
            </pre>
          )}
          {result.errors?.length ? (
            <>
              <h4>Ошибки по строкам (номер строки как в Excel)</h4>
              <ul>
                {result.errors.map(e => (
                  <li key={`${e.row}-${e.message}`}>
                    строка <strong>{e.row}</strong>
                    :

                    {' '}
                    {e.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            result.ok && !result.aborted ? <p className="muted">Ошибок валидации нет.</p> : null
          )}
          {result.preview?.length ? (
            <>
              <h4>Превью (часть строк)</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Строка</th>
                      <th>Действие</th>
                      <th>Категория</th>
                      <th>Бренд</th>
                      <th>Название</th>
                      <th>Цена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((p, idx) => (
                      <tr key={idx}>
                        <td>{p.row}</td>
                        <td>{p.action}</td>
                        <td>{p.category}</td>
                        <td>{p.brand ?? '—'}</td>
                        <td>{p.name}</td>
                        <td>{p.price ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      )}
    </>
  );
}
