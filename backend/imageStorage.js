import { v2 as cloudinary } from 'cloudinary';

/** @type {boolean} */
let configured = false;

function ensureCloudinary() {
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!cloudName || !apiKey || !apiSecret) return false;
  if (!configured) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    configured = true;
  }
  return true;
}

/** @returns {boolean} */
export function isCloudinaryEnabled() {
  return ensureCloudinary();
}

/**
 * Загрузка буфера в Cloudinary (папка vape-shop).
 * @param {Buffer} buffer
 * @param {string} [originalName]
 * @returns {Promise<string>} secure_url
 */
export async function uploadImageBuffer(buffer, originalName = 'image') {
  if (!ensureCloudinary()) {
    const err = new Error('Cloudinary не настроен (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)');
    err.code = 'STORAGE_NOT_CONFIGURED';
    throw err;
  }

  const base = String(originalName || 'image')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80) || 'image';

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'vape-shop',
        public_id: `${base}-${Date.now()}`,
        resource_type: 'image',
        overwrite: false,
        // Сжимаем уже на входе: ограничиваем ширину и автоподбираем качество,
        // чтобы не хранить гигантские оригиналы.
        transformation: [{ width: 1600, crop: 'limit', quality: 'auto:good' }],
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(String(result?.secure_url || ''));
      },
    );
    stream.end(buffer);
  });
}
