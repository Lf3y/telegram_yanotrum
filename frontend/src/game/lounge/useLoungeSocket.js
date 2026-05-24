import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { resolveApiBase } from '../../lib/api';
import { DEFAULT_WORLD, LOUNGE_COLORS } from './constants';

/**
 * @typedef {Object} LoungePlayer
 * @property {string} id
 * @property {string} name
 * @property {string} username
 * @property {string} color
 * @property {number} x
 * @property {number} y
 * @property {'down' | 'up' | 'left' | 'right'} direction
 * @property {boolean} moving
 * @property {string} message
 * @property {number} messageUntil
 */

/**
 * @typedef {Object} VapeEvent
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {'down' | 'up' | 'left' | 'right'} direction
 * @property {string} color
 * @property {number} at
 */

/**
 * Достаёт сохранённый цвет персонажа.
 * @param {string | number} userId
 * @returns {string}
 */
function loadColor(userId) {
  const saved = window.localStorage.getItem(`lounge-color:${userId}`);
  return LOUNGE_COLORS.includes(saved) ? saved : LOUNGE_COLORS[Number(String(userId).slice(-1)) % LOUNGE_COLORS.length];
}

/**
 * Хук realtime-комнаты King Lounge.
 * @param {{ id: string | number, username?: string, first_name?: string, last_name?: string }} user
 */
export function useLoungeSocket(user) {
  const socketRef = useRef(null);
  const [selfId, setSelfId] = useState('');
  const [world, setWorld] = useState(DEFAULT_WORLD);
  const [playersById, setPlayersById] = useState({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [color, setColorState] = useState(() => loadColor(user.id));
  const initialColorRef = useRef(color);
  const [vapeEvents, setVapeEvents] = useState([]);

  useEffect(() => {
    const base = resolveApiBase() || window.location.origin;
    const socket = io(`${base}/lounge`, {
      transports: ['websocket', 'polling'],
      auth: {
        userId: String(user.id),
        username: user.username || '',
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        color: initialColorRef.current,
      },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError('');
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', () => {
      setError('Не удалось подключиться к лаунжу');
    });

    socket.on('lounge:error', (payload) => {
      setError(String(payload?.message || 'Ошибка комнаты'));
    });

    socket.on('lounge:init', (payload) => {
      setSelfId(String(payload.selfId || ''));
      setWorld(payload.world || DEFAULT_WORLD);
      setPlayersById(Object.fromEntries((payload.players || []).map((player) => [player.id, player])));
    });

    socket.on('player:joined', (player) => {
      setPlayersById((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on('player:update', (player) => {
      setPlayersById((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on('chat:message', (player) => {
      setPlayersById((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on('player:vape', (event) => {
      setVapeEvents((prev) => [...prev.slice(-16), event]);
    });

    socket.on('player:left', ({ id }) => {
      setPlayersById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user.first_name, user.id, user.last_name, user.username]);

  const players = useMemo(() => Object.values(playersById), [playersById]);

  const sendMove = useCallback((payload) => {
    socketRef.current?.emit('player:move', payload);
  }, []);

  const sendChat = useCallback((text) => {
    socketRef.current?.emit('chat:message', { text });
  }, []);

  const sendVape = useCallback(() => {
    socketRef.current?.emit('player:vape');
  }, []);

  const setColor = useCallback((nextColor) => {
    if (!LOUNGE_COLORS.includes(nextColor)) return;
    window.localStorage.setItem(`lounge-color:${user.id}`, nextColor);
    setColorState(nextColor);
    socketRef.current?.emit('player:customize', { color: nextColor });
  }, [user.id]);

  return {
    selfId,
    world,
    players,
    connected,
    error,
    color,
    vapeEvents,
    sendMove,
    sendChat,
    sendVape,
    setColor,
  };
}
