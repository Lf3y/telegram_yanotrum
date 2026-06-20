/**
 * Лёгкий синтез UI-звуков через Web Audio API — без аудиофайлов.
 * Звуки короткие и тихие, чтобы не раздражать. Состояние вкл/выкл
 * хранится в localStorage. AudioContext создаётся лениво на первом
 * пользовательском действии (требование политик автоплея).
 */

const STORAGE_KEY = 'vape_sound_enabled_v1';

/** @type {AudioContext | null} */
let audioCtx = null;
let enabled = readEnabled();

/** @returns {boolean} */
function readEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

/** @returns {AudioContext | null} */
function getCtx() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

/**
 * Проигрывает одну ноту с мягкой огибающей.
 * @param {AudioContext} ctx
 * @param {{ freq: number, start: number, dur: number, type?: OscillatorType, peak?: number }} note
 */
function playNote(ctx, { freq, start, dur, type = 'sine', peak = 0.05 }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/**
 * Проигрывает последовательность нот, если звук включён.
 * @param {{ freq: number, start: number, dur: number, type?: OscillatorType, peak?: number }[]} notes
 */
function play(notes) {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    notes.forEach((note) => playNote(ctx, note));
  } catch {
    /* аудио недоступно — игнорируем */
  }
}

/** Мягкий клик (навигация, мелкие действия). */
export const playTap = () => play([{ freq: 540, start: 0, dur: 0.07, type: 'sine', peak: 0.035 }]);

/** Восходящий блик «добавлено в корзину». */
export const playAdd = () =>
  play([
    { freq: 523, start: 0, dur: 0.09, type: 'triangle', peak: 0.045 },
    { freq: 784, start: 0.05, dur: 0.1, type: 'triangle', peak: 0.045 },
  ]);

/** Радостный арпеджио — успешный заказ. */
export const playSuccess = () =>
  play([
    { freq: 523, start: 0, dur: 0.14, type: 'triangle', peak: 0.05 },
    { freq: 659, start: 0.1, dur: 0.14, type: 'triangle', peak: 0.05 },
    { freq: 784, start: 0.2, dur: 0.22, type: 'triangle', peak: 0.055 },
  ]);

/** Нисходящий сигнал ошибки. */
export const playError = () =>
  play([
    { freq: 380, start: 0, dur: 0.12, type: 'sawtooth', peak: 0.04 },
    { freq: 240, start: 0.09, dur: 0.18, type: 'sawtooth', peak: 0.04 },
  ]);

/** @returns {boolean} */
export const isSoundEnabled = () => enabled;

/**
 * Включает/выключает звуки и сохраняет выбор.
 * @param {boolean} next
 * @returns {void}
 */
export const setSoundEnabled = (next) => {
  enabled = Boolean(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* localStorage недоступен — игнорируем */
  }
  if (enabled) playTap();
};
