import { useEffect, useRef } from 'react';
import { SMOKE_BURST_EVENT } from '../lib/fx';

/**
 * @typedef {Object} SmokePuff
 * @property {number} x        Горизонтальная позиция центра (px).
 * @property {number} y        Вертикальная позиция центра (px).
 * @property {number} radius   Базовый радиус облака (px).
 * @property {number} drift    Горизонтальный дрейф за секунду (px/s).
 * @property {number} rise     Скорость подъёма за секунду (px/s).
 * @property {number} swayAmp  Амплитуда покачивания (px).
 * @property {number} swayFreq Частота покачивания (рад/с).
 * @property {number} phase    Начальная фаза покачивания (рад).
 * @property {number} alpha    Базовая непрозрачность облака (0..1).
 * @property {number} spriteIndex Индекс цветного спрайта.
 */

const SPRITE_SIZE = 256;

/** Палитра облаков под фиолетово-сиреневую тему интерфейса. */
const SPRITE_COLORS = [
  [168, 85, 247],
  [232, 121, 249],
  [147, 51, 234],
];

/**
 * Создаёт мягкий радиальный спрайт-«облако» заданного цвета.
 * Спрайт рендерится один раз, дальше используется через drawImage — это
 * убирает дорогой `filter: blur` из цикла анимации.
 * @param {[number, number, number]} rgb
 * @returns {HTMLCanvasElement}
 */
const createPuffSprite = ([r, g, b]) => {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext('2d');
  const half = SPRITE_SIZE / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.55)`);
  gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.22)`);
  gradient.addColorStop(0.75, `rgba(${r}, ${g}, ${b}, 0.05)`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return canvas;
};

/**
 * Раскладывает облака случайно по площади холста.
 * @param {number} width
 * @param {number} height
 * @param {number} count
 * @returns {SmokePuff[]}
 */
const createPuffs = (width, height, count) =>
  Array.from({ length: count }, (_, i) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: (0.45 + Math.random() * 0.55) * Math.min(width, height) * 0.7,
    drift: (Math.random() - 0.5) * 10,
    rise: 4 + Math.random() * 10,
    swayAmp: 16 + Math.random() * 28,
    swayFreq: 0.08 + Math.random() * 0.12,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.18 + Math.random() * 0.22,
    spriteIndex: i % SPRITE_COLORS.length,
  }));

/**
 * Лёгкий атмосферный фон с медленно дрейфующим дымом (в духе igloo.inc).
 * Рендерится на canvas позади контента, не перехватывает события и
 * приостанавливается на скрытой вкладке. Уважает prefers-reduced-motion.
 *
 * @param {{ opacity?: number, density?: number, className?: string }} props
 * @returns {JSX.Element}
 */
export default function AmbientSmoke({ opacity = 0.6, density = 1, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const sprites = SPRITE_COLORS.map(createPuffSprite);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let puffs = [];
    /** @type {{ x: number, y: number, vx: number, vy: number, life: number, maxLife: number, size: number, spriteIndex: number }[]} */
    let bursts = [];
    let rafId = 0;
    let lastTime = 0;

    /** Подгоняет размер холста под контейнер с учётом плотности пикселей. */
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const area = width * height;
      const baseCount = Math.round((area / 90000) * density);
      const count = Math.max(4, Math.min(12, baseCount));
      puffs = createPuffs(width, height, count);
    };

    /**
     * Рисует один кадр дыма.
     * @param {number} elapsedSeconds Секунды с момента старта (для покачивания).
     */
    const drawFrame = (elapsedSeconds) => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'screen';
      for (const puff of puffs) {
        const sway = Math.sin(elapsedSeconds * puff.swayFreq * Math.PI * 2 + puff.phase) * puff.swayAmp;
        const size = puff.radius * 2;
        ctx.globalAlpha = puff.alpha;
        ctx.drawImage(
          sprites[puff.spriteIndex],
          puff.x + sway - puff.radius,
          puff.y - puff.radius,
          size,
          size,
        );
      }
      for (const b of bursts) {
        const t = b.life / b.maxLife;
        const size = b.size * (1.6 - t);
        ctx.globalAlpha = Math.max(0, t) * 0.7;
        ctx.drawImage(sprites[b.spriteIndex], b.x - size / 2, b.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    /**
     * Создаёт всплеск дыма в точке (быстрые расходящиеся и поднимающиеся частицы).
     * @param {number} x
     * @param {number} y
     * @param {number} power
     */
    const spawnBurst = (x, y, power) => {
      const count = Math.round(5 * power);
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + Math.random();
        const speed = 20 + Math.random() * 40;
        bursts.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30,
          life: 1,
          maxLife: 1,
          size: (50 + Math.random() * 50) * power,
          spriteIndex: Math.floor(Math.random() * SPRITE_COLORS.length),
        });
      }
      if (bursts.length > 60) bursts = bursts.slice(-60);
    };

    /** Кадр анимации: двигает облака по времени и перерисовывает. */
    const tick = (time) => {
      const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
      lastTime = time;

      for (const puff of puffs) {
        puff.y -= puff.rise * delta;
        puff.x += puff.drift * delta;
        if (puff.y + puff.radius < 0) {
          puff.y = height + puff.radius;
          puff.x = Math.random() * width;
        }
        if (puff.x - puff.radius > width) puff.x = -puff.radius;
        if (puff.x + puff.radius < 0) puff.x = width + puff.radius;
      }

      if (bursts.length) {
        for (const b of bursts) {
          b.x += b.vx * delta;
          b.y += b.vy * delta;
          b.vy -= 18 * delta;
          b.life -= delta / 0.9;
        }
        bursts = bursts.filter((b) => b.life > 0);
      }

      drawFrame(time / 1000);
      rafId = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (rafId) return;
      lastTime = 0;
      rafId = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      if (!rafId) return;
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else if (!reduceMotion) start();
    };

    resize();

    if (reduceMotion) {
      drawFrame(0);
    } else {
      start();
    }

    /** @param {Event} event */
    const handleBurst = (event) => {
      if (reduceMotion) return;
      const detail = /** @type {CustomEvent} */ (event).detail || {};
      spawnBurst(detail.x ?? width / 2, detail.y ?? height / 2, detail.power || 1);
      if (!document.hidden) start();
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduceMotion) drawFrame(0);
    });
    resizeObserver.observe(canvas);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener(SMOKE_BURST_EVENT, handleBurst);

    return () => {
      stop();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener(SMOKE_BURST_EVENT, handleBurst);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      className={`ambient-smoke ${className}`.trim()}
      style={{ opacity }}
      aria-hidden="true"
    />
  );
}
