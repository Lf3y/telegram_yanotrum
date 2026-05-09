import { loadAuth } from './auth';

function joinUrl(base, path) {
  const b = String(base || '').replace(/\/$/, '');
  const p = String(path || '');
  if (!p) return b;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  const pp = p.startsWith('/') ? p : `/${p}`;
  return `${b}${pp}`;
}

export async function adminFetch(path, init = {}) {
  const { apiBase, token } = loadAuth();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('x-admin-token', token);
  const hasBody = init.body != null && init.body !== '';
  if (!headers.has('content-type') && hasBody && !(init.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }

  const res = await fetch(joinUrl(apiBase, path), { ...init, headers });
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function adminUpload(file) {
  const { apiBase, token } = loadAuth();
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(joinUrl(apiBase, '/api/admin/upload'), {
    method: 'POST',
    headers: token ? { 'x-admin-token': token } : undefined,
    body: form,
  });

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Импорт товаров из Excel (.xlsx, .xls) или CSV. dryRun — только проверка и превью.
 */
export async function adminImportProducts(file, { dryRun = false, force = false } = {}) {
  const { apiBase, token } = loadAuth();
  const form = new FormData();
  form.append('file', file);

  const q = new URLSearchParams();
  if (dryRun) q.set('dry_run', '1');
  if (force) q.set('force', '1');

  const url = joinUrl(apiBase, `/api/admin/import/products${q.toString() ? `?${q}` : ''}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: token ? { 'x-admin-token': token } : undefined,
    body: form,
  });

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      data?.preview?.message ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

