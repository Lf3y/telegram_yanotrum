import { useCallback, useRef } from 'react';

/**
 * @typedef {'step' | 'vape' | 'chat' | 'color'} LoungeSound
 */

/**
 * Создаёт короткий тон через Web Audio без внешних файлов.
 * @param {AudioContext} ctx
 * @param {{ frequency: number, type?: OscillatorType, duration: number, gain: number, slideTo?: number }} options
 */
function tone(ctx, options) {
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = options.type || 'sine';
  oscillator.frequency.setValueAtTime(options.frequency, now);
  if (options.slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(options.slideTo, now + options.duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(options.gain, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + options.duration + 0.02);
}

/**
 * Генератор коротких звуков для действий в лаунже.
 */
export function useLoungeAudio() {
  const ctxRef = useRef(null);
  const lastStepAtRef = useRef(0);

  const unlock = useCallback(() => {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!ctxRef.current) ctxRef.current = new AudioCtor();
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  const play = useCallback((sound) => {
    const ctx = unlock();
    if (!ctx) return;

    if (sound === 'step') {
      const now = performance.now();
      if (now - lastStepAtRef.current < 340) return;
      lastStepAtRef.current = now;
      tone(ctx, { frequency: 115, type: 'square', duration: 0.055, gain: 0.018, slideTo: 82 });
      return;
    }

    if (sound === 'vape') {
      tone(ctx, { frequency: 420, type: 'triangle', duration: 0.16, gain: 0.028, slideTo: 190 });
      window.setTimeout(() => tone(ctx, { frequency: 260, type: 'sine', duration: 0.11, gain: 0.018, slideTo: 120 }), 50);
      return;
    }

    if (sound === 'chat') {
      tone(ctx, { frequency: 620, type: 'sine', duration: 0.07, gain: 0.024 });
      window.setTimeout(() => tone(ctx, { frequency: 840, type: 'sine', duration: 0.08, gain: 0.02 }), 70);
      return;
    }

    tone(ctx, { frequency: 520, type: 'triangle', duration: 0.07, gain: 0.022 });
    window.setTimeout(() => tone(ctx, { frequency: 720, type: 'triangle', duration: 0.08, gain: 0.018 }), 55);
  }, [unlock]);

  return { play, unlock };
}
