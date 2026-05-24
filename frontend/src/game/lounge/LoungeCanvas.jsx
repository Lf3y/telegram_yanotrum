import { useEffect, useRef, useState } from 'react';
import { DEFAULT_WORLD } from './constants';

const TILE = 32;
const BUBBLE_TTL_MS = 5000;
const BUBBLE_MAX_WIDTH = 150;

/**
 * Рисует пиксельный прямоугольник без сглаживания.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} color
 */
function pixelRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/**
 * Ограничивает число диапазоном.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Рисует комнату в стиле простой пиксельной тайл-карты.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ width: number, height: number }} world
 */
function drawRoom(ctx, world) {
  pixelRect(ctx, 0, 0, world.width, world.height, '#171126');

  for (let x = 0; x < world.width; x += TILE) {
    for (let y = 0; y < world.height; y += TILE) {
      const odd = (x / TILE + y / TILE) % 2 === 0;
      pixelRect(ctx, x, y, TILE, TILE, odd ? '#211832' : '#241a38');
      ctx.strokeStyle = 'rgba(255,255,255,0.025)';
      ctx.strokeRect(x + 0.5, y + 0.5, TILE, TILE);
    }
  }

  pixelRect(ctx, 0, 0, world.width, 38, '#33214d');
  pixelRect(ctx, 0, world.height - 38, world.width, 38, '#120d1f');
  pixelRect(ctx, 0, 0, 38, world.height, '#120d1f');
  pixelRect(ctx, world.width - 38, 0, 38, world.height, '#120d1f');

  pixelRect(ctx, 64, 70, 250, 54, '#5b3b77');
  pixelRect(ctx, 76, 82, 226, 30, '#7c3aed');
  pixelRect(ctx, 95, 95, 42, 14, '#c4b5fd');
  pixelRect(ctx, 156, 95, 42, 14, '#67e8f9');
  pixelRect(ctx, 217, 95, 42, 14, '#86efac');

  pixelRect(ctx, 690, 96, 160, 44, '#263d58');
  pixelRect(ctx, 706, 74, 46, 42, '#0f766e');
  pixelRect(ctx, 784, 74, 46, 42, '#0f766e');
  pixelRect(ctx, 714, 64, 30, 14, '#22c55e');
  pixelRect(ctx, 792, 64, 30, 14, '#22c55e');

  pixelRect(ctx, 390, 420, 190, 70, '#3b264f');
  pixelRect(ctx, 405, 395, 160, 38, '#5b3b77');
  pixelRect(ctx, 428, 406, 42, 18, '#ec4899');
  pixelRect(ctx, 502, 406, 42, 18, '#06b6d4');

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 18px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('KING LOUNGE', 82, 56);
}

/**
 * Режет строку на несколько строк под ширину пузыря.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]}
 */
function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });

  if (current) lines.push(current);
  return lines.slice(0, 3);
}

/**
 * Рисует облако сообщения над игроком.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./useLoungeSocket').ChatBubble} bubble
 * @param {number} x
 * @param {number} y
 * @param {number} stackIndex
 */
function drawBubble(ctx, bubble, x, y, stackIndex) {
  if (!bubble.text) return;
  const now = Date.now();
  const age = now - bubble.createdAt;
  const progress = clamp(age / BUBBLE_TTL_MS, 0, 1);
  const alpha = clamp((bubble.until - now) / 700, 0, 1);

  ctx.font = '700 13px Manrope, sans-serif';
  ctx.textAlign = 'left';
  const lines = wrapText(ctx, bubble.text, BUBBLE_MAX_WIDTH - 22);
  const width = Math.min(
    BUBBLE_MAX_WIDTH,
    Math.max(58, ...lines.map((line) => ctx.measureText(line).width + 22)),
  );
  const height = 18 + lines.length * 16;
  const bx = x - width / 2;
  const by = y - 68 - stackIndex * (height + 8) - progress * 18;

  pixelRect(ctx, bx, by, width, height, `rgba(9, 7, 18, ${0.88 * alpha})`);
  ctx.strokeStyle = `rgba(124, 58, 237, ${0.8 * alpha})`;
  ctx.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(width), Math.round(height));
  ctx.fillStyle = `rgba(248, 250, 252, ${alpha})`;
  lines.forEach((line, index) => {
    ctx.fillText(line, bx + 11, by + 20 + index * 16, width - 18);
  });
}

/**
 * Рисует одного игрока как пиксельного персонажа сверху.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./useLoungeSocket').LoungePlayer} player
 * @param {boolean} isSelf
 */
function drawPlayer(ctx, player, isSelf) {
  const x = player.x;
  const y = player.y;
  pixelRect(ctx, x - 14, y + 10, 28, 8, 'rgba(0,0,0,0.22)');
  pixelRect(ctx, x - 9, y - 10, 18, 20, player.color);
  pixelRect(ctx, x - 7, y - 24, 14, 14, '#f2c9a0');
  pixelRect(ctx, x - 8, y - 28, 16, 6, '#241423');
  pixelRect(ctx, x - 5, y - 18, 3, 3, '#1f2937');
  pixelRect(ctx, x + 3, y - 18, 3, 3, '#1f2937');
  pixelRect(ctx, x - 13, y - 4, 5, 13, '#f2c9a0');
  pixelRect(ctx, x + 8, y - 4, 5, 13, '#f2c9a0');
  pixelRect(ctx, x - 9, y + 10, 7, 10, '#111827');
  pixelRect(ctx, x + 2, y + 10, 7, 10, '#111827');

  if (isSelf) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(x - 15) + 0.5, Math.round(y - 29) + 0.5, 30, 51);
  }

  ctx.font = '700 12px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = isSelf ? '#facc15' : '#e5e7eb';
  ctx.fillText(player.name, x, y - 35, 130);

}

/**
 * Рисует активные чат-баблы над игроками.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./useLoungeSocket').ChatBubble[]} chatBubbles
 * @param {Map<string, import('./useLoungeSocket').LoungePlayer>} playerMap
 */
function drawChatBubbles(ctx, chatBubbles, playerMap) {
  const now = Date.now();
  const byPlayer = new Map();

  chatBubbles
    .filter((bubble) => bubble.until > now)
    .forEach((bubble) => {
      const list = byPlayer.get(bubble.playerId) || [];
      list.push(bubble);
      byPlayer.set(bubble.playerId, list);
    });

  byPlayer.forEach((bubbles, playerId) => {
    const player = playerMap.get(playerId);
    if (!player) return;

    bubbles
      .sort((a, b) => b.createdAt - a.createdAt)
      .forEach((bubble, index) => drawBubble(ctx, bubble, player.x, player.y, index));
  });
}

/**
 * Рисует дым от игроков.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./useLoungeSocket').VapeEvent[]} events
 */
function drawVape(ctx, events) {
  const now = Date.now();
  events.forEach((event) => {
    const age = now - event.at;
    if (age > 1200) return;
    const alpha = 1 - age / 1200;
    const drift = age / 18;
    ctx.fillStyle = `rgba(226, 232, 240, ${alpha * 0.42})`;
    for (let i = 0; i < 5; i += 1) {
      const offset = i * 11;
      ctx.beginPath();
      ctx.arc(event.x + drift + offset - 12, event.y - 28 - offset * 0.45, 7 + i * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * Canvas лаунжа: рисует мир, игроков, чат и пар.
 * @param {{
 *   players: import('./useLoungeSocket').LoungePlayer[],
 *   selfId: string,
 *   world: { width: number, height: number, tile?: number },
 *   vapeEvents: import('./useLoungeSocket').VapeEvent[],
 *   chatBubbles: import('./useLoungeSocket').ChatBubble[]
 * }} props
 */
export function LoungeCanvas({ players, selfId, world, vapeEvents, chatBubbles }) {
  const canvasRef = useRef(null);
  const cameraRef = useRef({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 640, height: 420, dpr: 1 });
  const safeWorld = world || DEFAULT_WORLD;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    /**
     * Синхронизирует backing-store canvas с реальным размером блока.
     */
    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(320, Math.round(rect.width));
      const height = Math.max(320, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      setViewport({ width, height, dpr });
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let frameId = 0;

    const draw = () => {
      const target = players.find((player) => player.id === selfId) || players[0];
      const maxCameraX = Math.max(0, safeWorld.width - viewport.width);
      const maxCameraY = Math.max(0, safeWorld.height - viewport.height);
      const desiredCamera = target
        ? {
          x: clamp(target.x - viewport.width / 2, 0, maxCameraX),
          y: clamp(target.y - viewport.height / 2, 0, maxCameraY),
        }
        : { x: 0, y: 0 };

      cameraRef.current.x += (desiredCamera.x - cameraRef.current.x) * 0.14;
      cameraRef.current.y += (desiredCamera.y - cameraRef.current.y) * 0.14;

      ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      ctx.clearRect(0, 0, viewport.width, viewport.height);
      ctx.save();
      ctx.translate(-cameraRef.current.x, -cameraRef.current.y);
      drawRoom(ctx, safeWorld);
      const sortedPlayers = [...players].sort((a, b) => a.y - b.y);
      const playerMap = new Map(sortedPlayers.map((player) => [player.id, player]));
      sortedPlayers.forEach((player) => drawPlayer(ctx, player, player.id === selfId));
      drawChatBubbles(ctx, chatBubbles, playerMap);
      drawVape(ctx, vapeEvents);
      ctx.restore();

      frameId = window.requestAnimationFrame(draw);
    };

    draw();
    return () => window.cancelAnimationFrame(frameId);
  }, [chatBubbles, players, safeWorld, selfId, vapeEvents, viewport]);

  return (
    <canvas
      ref={canvasRef}
      className="lounge-canvas"
      aria-label="King Lounge"
    />
  );
}
