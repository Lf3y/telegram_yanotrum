const { app, BrowserWindow, shell, Menu } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Фиксированный порт встроенного статик-сервера: даёт стабильный origin,
// чтобы сохранялись токен/настройки админки (localStorage) между запусками,
// и чтобы бэкенд мог добавить этот origin в CORS-allowlist.
const PORT = 41789;
const ROOT = path.join(__dirname, 'app');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

/**
 * Поднимает локальный статик-сервер для собранной админки (SPA-фолбэк на index.html).
 * @returns {Promise<http.Server>}
 */
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let filePath = path.normalize(path.join(ROOT, urlPath));

        if (!filePath.startsWith(ROOT)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        const isFile = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
        if (!isFile) {
          // клиентский роут или директория → отдаём index.html
          filePath = path.join(ROOT, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
      } catch {
        res.statusCode = 500;
        res.end('Internal error');
      }
    });

    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

async function createWindow() {
  try {
    await startServer();
  } catch (err) {
    console.error('Не удалось запустить встроенный сервер:', err);
  }

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0c',
    autoHideMenuBar: true,
    title: 'VapeShop Admin',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);

  // внешние ссылки открываем в системном браузере, а не в окне приложения
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
