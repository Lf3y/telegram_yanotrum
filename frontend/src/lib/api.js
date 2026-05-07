const API_BASE = (import.meta?.env?.VITE_API_URL || '').replace(/\/$/, '');

export function apiUrl(pathname) {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (!API_BASE) return path; // local dev via Vite proxy (/api -> localhost:3001)
  return `${API_BASE}${path}`;
}

export async function apiFetch(pathname, init) {
  return fetch(apiUrl(pathname), init);
}

