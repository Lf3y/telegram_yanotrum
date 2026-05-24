import { Server } from 'socket.io';

const WORLD = {
  width: 960,
  height: 640,
  tile: 32,
  maxPlayers: 60,
};

const PLAYER_SIZE = 26;
const MESSAGE_MAX_LENGTH = 50;
const MESSAGE_TTL_MS = 5000;
const CHAT_COOLDOWN_MS = 2500;
const VAPE_COOLDOWN_MS = 900;
const COLORS = ['#7c3aed', '#06b6d4', '#22c55e', '#f97316', '#ec4899', '#eab308', '#38bdf8'];

/** @typedef {'down' | 'up' | 'left' | 'right'} Direction */

/**
 * @typedef {Object} LoungePlayer
 * @property {string} id
 * @property {string} name
 * @property {string} username
 * @property {string} color
 * @property {number} x
 * @property {number} y
 * @property {Direction} direction
 * @property {boolean} moving
 * @property {string} message
 * @property {number} messageUntil
 * @property {number} lastChatAt
 * @property {number} lastVapeAt
 */

/** @type {Map<string, LoungePlayer>} */
const players = new Map();

/**
 * Возвращает число в безопасном диапазоне.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Очищает пользовательский текст для короткого сообщения над персонажем.
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeText(value) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MESSAGE_MAX_LENGTH);
}

/**
 * Делает имя игрока из Telegram-профиля.
 * @param {Record<string, unknown>} auth
 * @returns {string}
 */
function resolvePlayerName(auth) {
  const firstName = sanitizeText(auth.firstName);
  const lastName = sanitizeText(auth.lastName);
  const username = sanitizeText(auth.username).replace(/^@/, '');
  return [firstName, lastName].filter(Boolean).join(' ') || username || 'Гость';
}

/**
 * Выбирает стабильный цвет по id игрока.
 * @param {string} id
 * @returns {string}
 */
function colorById(id) {
  const sum = [...id].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return COLORS[sum % COLORS.length];
}

/**
 * Создаёт стартовую позицию по текущему количеству игроков.
 * @returns {{ x: number, y: number }}
 */
function spawnPoint() {
  const index = players.size % 24;
  const col = index % 6;
  const row = Math.floor(index / 6);
  return {
    x: 180 + col * 72,
    y: 180 + row * 64,
  };
}

/**
 * Нормализует направление игрока.
 * @param {unknown} value
 * @returns {Direction}
 */
function normalizeDirection(value) {
  return value === 'up' || value === 'left' || value === 'right' ? value : 'down';
}

/**
 * Создаёт или обновляет игрока по handshake auth.
 * @param {Record<string, unknown>} auth
 * @returns {LoungePlayer}
 */
function upsertPlayer(auth) {
  const id = sanitizeText(auth.userId);
  if (!id) {
    throw new Error('Missing Telegram user id');
  }

  const current = players.get(id);
  const position = current ? { x: current.x, y: current.y } : spawnPoint();
  const color = /^#[0-9a-f]{6}$/i.test(String(auth.color || ''))
    ? String(auth.color)
    : (current?.color || colorById(id));

  const player = {
    id,
    name: resolvePlayerName(auth),
    username: sanitizeText(auth.username).replace(/^@/, ''),
    color,
    x: position.x,
    y: position.y,
    direction: current?.direction || 'down',
    moving: false,
    message: current?.message || '',
    messageUntil: current?.messageUntil || 0,
    lastChatAt: current?.lastChatAt || 0,
    lastVapeAt: current?.lastVapeAt || 0,
  };

  players.set(id, player);
  return player;
}

/**
 * Отдаёт публичное состояние игрока.
 * @param {LoungePlayer} player
 * @returns {Omit<LoungePlayer, 'lastChatAt' | 'lastVapeAt'>}
 */
function publicPlayer(player) {
  const { lastChatAt: _lastChatAt, lastVapeAt: _lastVapeAt, ...publicState } = player;
  return publicState;
}

/**
 * Подключает realtime-комнату King Lounge к HTTP-серверу.
 * @param {import('http').Server} httpServer
 * @param {{ allowedOrigins: string[] }} options
 * @returns {Server}
 */
export function initGameLounge(httpServer, options) {
  const io = new Server(httpServer, {
    cors: {
      origin: options.allowedOrigins,
      methods: ['GET', 'POST'],
    },
  });

  const lounge = io.of('/lounge');

  lounge.on('connection', (socket) => {
    let player;

    try {
      player = upsertPlayer(socket.handshake.auth || {});
    } catch {
      socket.emit('lounge:error', { message: 'Не удалось войти в комнату' });
      socket.disconnect(true);
      return;
    }

    socket.join(player.id);
    socket.emit('lounge:init', {
      selfId: player.id,
      world: WORLD,
      players: [...players.values()].map(publicPlayer),
    });
    socket.broadcast.emit('player:joined', publicPlayer(player));

    socket.on('player:move', (payload = {}) => {
      player.x = clamp(Number(payload.x) || player.x, PLAYER_SIZE, WORLD.width - PLAYER_SIZE);
      player.y = clamp(Number(payload.y) || player.y, PLAYER_SIZE, WORLD.height - PLAYER_SIZE);
      player.direction = normalizeDirection(payload.direction);
      player.moving = Boolean(payload.moving);
      lounge.emit('player:update', publicPlayer(player));
    });

    socket.on('chat:message', (payload = {}) => {
      const now = Date.now();
      if (now - player.lastChatAt < CHAT_COOLDOWN_MS) return;

      const text = sanitizeText(payload.text);
      if (!text) return;

      player.lastChatAt = now;
      player.message = text;
      player.messageUntil = now + MESSAGE_TTL_MS;
      lounge.emit('chat:message', publicPlayer(player));
    });

    socket.on('player:customize', (payload = {}) => {
      const color = String(payload.color || '');
      if (!/^#[0-9a-f]{6}$/i.test(color)) return;

      player.color = color;
      lounge.emit('player:update', publicPlayer(player));
    });

    socket.on('player:vape', () => {
      const now = Date.now();
      if (now - player.lastVapeAt < VAPE_COOLDOWN_MS) return;

      player.lastVapeAt = now;
      lounge.emit('player:vape', {
        id: player.id,
        x: player.x,
        y: player.y,
        direction: player.direction,
        color: player.color,
        at: now,
      });
    });

    socket.on('disconnect', () => {
      players.delete(player.id);
      socket.broadcast.emit('player:left', { id: player.id });
    });
  });

  return io;
}
