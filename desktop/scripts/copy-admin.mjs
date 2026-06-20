import { cpSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'admin', 'dist');
const dest = join(here, '..', 'app');

if (!existsSync(src)) {
  console.error('[copy-admin] admin/dist не найден. Сначала собери админку: npm run build-admin');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

console.log('[copy-admin] admin/dist → desktop/app скопировано');
