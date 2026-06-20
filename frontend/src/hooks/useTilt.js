import { useEffect, useRef } from 'react';

/**
 * Лёгкий 3D-наклон элемента вслед за курсором (параллакс-эффект).
 * Активен только на устройствах с точным указателем (десктоп), чтобы
 * не мешать вертикальному скроллу на тач-экранах, и отключается при
 * включённом prefers-reduced-motion.
 *
 * @param {{ max?: number, scale?: number }} [options] max — макс. угол наклона (град), scale — увеличение при наведении.
 * @returns {import('react').RefObject<HTMLElement>}
 */
export function useTilt({ max = 8, scale = 1.02 } = {}) {
  const ref = useRef(/** @type {HTMLElement | null} */ (null));

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return undefined;

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!finePointer || reduceMotion) return undefined;

    let rafId = 0;

    /** @param {PointerEvent} event */
    const handleMove = (event) => {
      const rect = el.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const rotateX = (0.5 - py) * 2 * max;
      const rotateY = (px - 0.5) * 2 * max;
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        el.style.transform =
          `perspective(720px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(${scale})`;
      });
    };

    const handleLeave = () => {
      window.cancelAnimationFrame(rafId);
      el.style.transform = '';
    };

    el.addEventListener('pointermove', handleMove);
    el.addEventListener('pointerleave', handleLeave);

    return () => {
      window.cancelAnimationFrame(rafId);
      el.removeEventListener('pointermove', handleMove);
      el.removeEventListener('pointerleave', handleLeave);
      el.style.transform = '';
    };
  }, [max, scale]);

  return ref;
}
