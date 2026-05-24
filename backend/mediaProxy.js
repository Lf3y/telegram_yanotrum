/**
 * Прокси внешних картинок (VK и др.) — Telegram WebView часто блокирует hotlink.
 */

const ALLOWED_HOST_SUFFIXES = [
  'userapi.com',
  'vk.com',
  'vkuserphoto.ru',
  'pinimg.com',
  'cloudinary.com',
  'imgur.com',
];

/**
 * @param {string} raw
 * @returns {URL|null}
 */
export function parseAllowedImageUrl(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 2048) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return null;
  const ok = ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  return ok ? u : null;
}

/**
 * @param {string} rawUrl
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
export async function fetchExternalImage(rawUrl) {
  const u = parseAllowedImageUrl(rawUrl);
  if (!u) {
    const err = new Error('URL not allowed');
    err.code = 'BAD_URL';
    throw err;
  }

  const res = await fetch(u.toString(), {
    headers: {
      'User-Agent': 'VapeShopBot/1.0',
      Accept: 'image/*',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    const err = new Error(`Upstream ${res.status}`);
    err.code = 'UPSTREAM';
    throw err;
  }

  const ct = res.headers.get('content-type') || 'image/jpeg';
  if (!ct.startsWith('image/')) {
    const err = new Error('Not an image');
    err.code = 'NOT_IMAGE';
    throw err;
  }

  const ab = await res.arrayBuffer();
  return { buffer: Buffer.from(ab), contentType: ct };
}
