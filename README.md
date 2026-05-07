# 🛒 Vape Shop — Telegram Mini App

Магазин жидкостей для вейпов. Работает как Telegram Mini App с ботом для уведомлений.

## Структура

```
vape-shop/
├── backend/          # Node.js + Express + SQLite
│   ├── server.js     # API сервер
│   ├── bot.js        # Telegram бот
│   ├── db.js         # База данных
│   └── .env          # Конфиг (токен, ID)
├── frontend/         # React + Vite
│   └── src/
│       ├── pages/    # Home, Catalog, Cart, Orders
│       ├── components/
│       └── store/    # Корзина (React Context)
└── start.sh          # Запуск всего сразу
```

## ⚡ Быстрый старт

### 1. Установи зависимости

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Запусти

```bash
cd ..
bash start.sh
```

Открой в браузере: **http://localhost:5173**

---

## 🌐 Запуск как Telegram Mini App (через ngrok)

Telegram требует HTTPS-ссылку для Mini App. Используем ngrok:

### Установка ngrok

```bash
# Mac
brew install ngrok

# Linux
snap install ngrok

# Или скачай с https://ngrok.com/download
```

### Запуск туннеля

```bash
# В отдельном терминале:
ngrok http 5173
```

Ngrok даст тебе ссылку вида: `https://abc123.ngrok-free.app`

### Настройка Mini App в BotFather

1. Открой @BotFather
2. `/mybots` → выбери бота → **Bot Settings**
3. **Menu Button** → **Configure menu button**
4. Введи URL: `https://abc123.ngrok-free.app`
5. Введи текст кнопки: `🛒 Открыть магазин`

### Обнови .env

```env
FRONTEND_URL=https://abc123.ngrok-free.app
```

Перезапусти бэкенд.

---

## 💬 Как работает система заказов

1. Клиент оформляет заказ в Mini App
2. **Бот отправляет тебе** (owner) сообщение с деталями заказа
3. **Ты отвечаешь на это сообщение** в Telegram — бот перешлёт ответ клиенту
4. Клиент видит ответ прямо в Telegram и в разделе "Заказы" в приложении

---

## 🗄️ База данных

SQLite файл: `backend/shop.db`

Таблицы: `categories`, `products`, `orders`

### Добавить товар вручную

```js
// В backend/db.js или через API
run('INSERT INTO products (category_id,name,brand,description,price,volume,nicotine,in_stock) VALUES (?,?,?,?,?,?,?,1)',
  [1, 'Новый вкус', 'Brand', 'Описание', 799, '60ml', '3мг']
);
```

---

## API эндпоинты

| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/categories | Все категории |
| GET | /api/brands?category=liquids | Бренды внутри категории |
| GET | /api/products | Все товары |
| GET | /api/products?category=liquids | Товары по категории |
| GET | /api/products?category=liquids&brand=blvk | Товары по категории и бренду |
| POST | /api/orders | Создать заказ |
| GET | /api/orders/user/:id | Заказы пользователя |

---

## 🧰 Управление базой (категории / бренды / товары)

База — SQLite файл `backend/shop.db` (создаётся автоматически).

### Вариант A: Через визуальный редактор SQLite (самое удобное)

Поставь любой GUI, например **DB Browser for SQLite**, открой `backend/shop.db` и редактируй таблицы:
- `categories`, `brands`, `products`: поле `image_url` — адрес файла на **твоём** сервере (после загрузки через админку это `https://…/uploads/…`), не внешняя произвольная ссылка из админки.
- `brands`: бренды внутри категории (подкатегории)
- `products`: также `brand_id`, остатки и т.д.

### Вариант B: Через Admin API (удобно для Render/удалёнки)

На бэкенде есть защищённые эндпоинты. Нужно задать переменную окружения `ADMIN_TOKEN`,
и отправлять заголовок `x-admin-token: <ADMIN_TOKEN>`.

Примеры (PowerShell):

```powershell
# Создать категорию
Invoke-RestMethod -Method Post "http://localhost:3001/api/admin/categories" `
  -Headers @{ "x-admin-token" = "devtoken" } `
  -ContentType "application/json" `
  -Body '{"name":"Тест","slug":"test","emoji":"🧨","description":"Описание","sort_order":10,"image_url":"https://localhost:3001/uploads/xxx.jpg"}'

# Создать бренд (category_id можно посмотреть в /api/categories)
Invoke-RestMethod -Method Post "http://localhost:3001/api/admin/brands" `
  -Headers @{ "x-admin-token" = "devtoken" } `
  -ContentType "application/json" `
  -Body '{"category_id":1,"name":"BLVK","slug":"blvk","sort_order":1,"image_url":null}'

# Создать товар (brand_id можно посмотреть в /api/brands?category=liquids)
Invoke-RestMethod -Method Post "http://localhost:3001/api/admin/products" `
  -Headers @{ "x-admin-token" = "devtoken" } `
  -ContentType "application/json" `
  -Body '{"category_id":1,"brand_id":1,"name":"Mango Ice","price":650,"volume":"60ml","nicotine":"3мг","image_url":null,"in_stock":1,"sort_order":1}'
```

### Важно про Render

На бесплатном Render файловая система у Web Service **не постоянная** — `shop.db` может сбрасываться после перезапуска/деплоя.
Для серьёзного продакшена лучше перейти на нормальную БД (Postgres) или отдельное хранилище.

---

## 🛠️ Локальная админка (отдельно от Mini App)

Админка вынесена в отдельное приложение `admin/` и работает **только локально** (по умолчанию `http://localhost:5174`).
Она использует Admin API и отправляет токен в заголовке `x-admin-token`.

### 1) Задай `ADMIN_TOKEN` на бэкенде

В `backend/.env` добавь:

```env
ADMIN_TOKEN=devtoken
```

И перезапусти бэкенд.

### 2) Запусти админку

```bash
cd admin
npm install
npm run dev
```

Открой `http://localhost:5174`, введи:
- API Base URL: `http://localhost:3001`
- ADMIN_TOKEN: `devtoken`

### Картинки (только загрузка файла в админке)

В админке **нет** поля «вставить ссылку с картинкой»: только выбор файла и «Загрузить».  
Файл пишется в `backend/uploads/`, в БД в `image_url` — полный URL до этого файла на твоём бэкенде.

Важно:
- **Локально** так и задумано.
- На **Render Free** файлы в `uploads` могут пропасть после рестарта. Для продакшена — объектное хранилище (S3 и т.п.).

### Что в админке

- **Дашборд** — выручка, заказы, график по дням, товары с низким остатком (1–5 шт.).
- **Товары** — поиск, правка цены/остатка/включения, удаление.
- **Заказы** — список и смена статуса.
- **Витрина** — по шагам: категории → бренды → товары (вкладки внутри экрана).

**Остатки:** в таблице `products` поле `stock_qty`: **−1** = безлимит (не уменьшаем при заказе), **0** = нет в наличии, **&gt;0** = списываем при оформлении заказа.

---

## 🌐 Деплой в Telegram Mini Apps (Render, два сервиса)

1. **Web Service (бэкенд)** — Root `backend`, Build `npm install`, Start `node server.js`.  
2. **Static Site (витрина)** — Root `frontend`, Build `npm install && npm run build`, Publish `dist`.  
3. В **Environment** бэкенда задай: `BOT_TOKEN`, `OWNER_CHAT_ID`, `FRONTEND_URL` (URL static site `https://…onrender.com`), `ADMIN_TOKEN` (секрет), опционально `ADMIN_URL` = URL админки если будешь хостить её отдельно.  
4. В **Environment** static site: `VITE_API_URL` = `https://<твой-бэкенд>.onrender.com` (без хвоста `/api`).  
5. В **@BotFather** → **Menu button** / команда **/start** с **Web App** → URL = URL витрины (static).  
6. Перезапусти бэкенд после правки env.  

**Админка** после деплоя: локально `npm run dev` в `admin/`, в форме входа укажи `API Base URL` = твой бэкенд на Render и тот же `ADMIN_TOKEN`, что в env бэкенда.

> На Free Render SQLite и папка `uploads` не гарантируют долговечность. Для «боевого» магазина планируй Postgres + внешнее хранилище картинок.
