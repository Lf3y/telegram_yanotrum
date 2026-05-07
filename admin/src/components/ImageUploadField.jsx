/**
 * Только загрузка файла на бэкенд. В БД в поле image_url хранится URL вида
 * https://.../uploads/xxx.jpg (файл на диске сервера, в БД — ссылка на него).
 */
export default function ImageUploadField({
  previewUrl,
  file,
  onFileChange,
  onUpload,
  onClear,
  busy,
  disabled,
  label = 'Картинка',
}) {
  return (
    <div className="field span-2">
      <span className="label">{label}</span>
      {previewUrl ? (
        <div className="row" style={{ alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
          <div className="thumb" style={{ width: 80, height: 56, borderRadius: 10 }}>
            <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          {onClear && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onClear} disabled={disabled}>
              Убрать фото
            </button>
          )}
        </div>
      ) : null}
      <div className="row" style={{ gap: 8 }}>
        <input
          type="file"
          accept="image/*"
          disabled={disabled}
          onChange={e => onFileChange?.(e.target.files?.[0] || null)}
          className="input"
          style={{ padding: 8, flex: 1 }}
        />
        <button type="button" className="btn btn-sm" disabled={disabled || busy} onClick={onUpload}>
          {busy ? '…' : 'Загрузить'}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>
        Файл сохраняется в папке <code>uploads/</code> на сервере; в БД в поле <code>image_url</code> хранится адрес этого файла (не картинка внутри SQL).
      </p>
    </div>
  );
}
