import { loadAuth } from './auth';

/**
 * Абсолютный URL картинки для превью в админке.
 * @param {string|null|undefined} url
 * @returns {string}
 */
export function resolveMediaUrl(url) {
  if (!url) return '';
  const s = String(url).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const { apiBase } = loadAuth();
  const base = String(apiBase || '').replace(/\/$/, '');
  if (s.startsWith('/') && base) return `${base}${s}`;
  return s;
}
