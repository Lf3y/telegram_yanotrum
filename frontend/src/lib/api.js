/** Базовый URL API (Render: задать как VITE_API_URL при сборке static site). */
const ENV_BASE = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');

/** Аварийно: можно прописать в index.html global до подключения Vite-бандла. */
function runtimeBaseFromWindow() {
  if (typeof window === 'undefined') return '';
  const w = window.__SHOP_API_URL__;
  return typeof w === 'string' ? w.trim().replace(/\/$/, '') : '';
}

export function resolveApiBase() {
  const b = ENV_BASE || runtimeBaseFromWindow();
  if (!b && import.meta.env.PROD) {
    // eslint-disable-next-line no-console
    console.warn(
      '[VapeShop] На продакшене не задан VITE_API_URL — запросы идут на домен витрины без API. '
        + 'В Render Static Site добавь переменную VITE_API_URL = URL бэкенда (без /api на конце) и пересобери.',
    );
  }
  return b;
}

export function apiUrl(pathname) {
  const base = resolveApiBase();
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (!base) return path;
  return `${base}${path}`;
}

/**
 * Обёртка над fetch с проверкой ответа.
 * Ошибки сети / CORS / 404 на статике — отклонённый промис и текст в Error.message (если есть JSON error).
 */
export async function apiFetch(pathname, init) {
  const url = apiUrl(pathname);
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    const msg = e?.message === 'Failed to fetch'
      ? 'Нет связи с сервером — проверь интернет или URL API (VITE_API_URL)'
      : (e?.message || 'Сеть недоступна');
    throw new Error(msg);
  }

  if (!res.ok) {
    const ct = res.headers.get('content-type') || '';
    let hint = `${res.status} ${res.statusText || ''}`.trim();
    if (ct.includes('application/json')) {
      const body = await res.json().catch(() => null);
      if (body && (body.error || body.message)) {
        hint = String(body.error || body.message);
      }
    }
    const err = new Error(hint);
    err.status = res.status;
    throw err;
  }
  return res;
}
