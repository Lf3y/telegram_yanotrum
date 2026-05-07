const KEY = 'vape_admin_auth_v1';

export function loadAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { apiBase: 'http://localhost:3001', token: '' };
    const parsed = JSON.parse(raw);
    return {
      apiBase: typeof parsed.apiBase === 'string' ? parsed.apiBase : 'http://localhost:3001',
      token: typeof parsed.token === 'string' ? parsed.token : '',
    };
  } catch {
    return { apiBase: 'http://localhost:3001', token: '' };
  }
}

export function saveAuth(next) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function clearAuth() {
  localStorage.removeItem(KEY);
}

