import { useEffect, useState } from 'react';

/**
 * @typedef {Object} VisualViewportLayout
 * @property {number} offsetTop
 * @property {number} offsetLeft
 * @property {number} height
 * @property {number} width
 * @property {number} keyboardInset
 */

const DEFAULT_LAYOUT = {
  offsetTop: 0,
  offsetLeft: 0,
  height: typeof window !== 'undefined' ? window.innerHeight : 0,
  width: typeof window !== 'undefined' ? window.innerWidth : 0,
  keyboardInset: 0,
};

/**
 * Отслеживает видимую область экрана при открытой экранной клавиатуре.
 * @param {boolean} enabled
 * @returns {VisualViewportLayout}
 */
export function useVisualViewportInset(enabled) {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setLayout(DEFAULT_LAYOUT);
      return undefined;
    }

    /**
     * Пересчитывает размеры видимого viewport.
     */
    const update = () => {
      const viewport = window.visualViewport;
      if (!viewport) {
        setLayout(DEFAULT_LAYOUT);
        return;
      }

      const keyboardInset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );

      setLayout({
        offsetTop: viewport.offsetTop,
        offsetLeft: viewport.offsetLeft,
        height: viewport.height,
        width: viewport.width,
        keyboardInset,
      });
    };

    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);

    const tg = window.Telegram?.WebApp;
    tg?.onEvent?.('viewportChanged', update);

    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
      tg?.offEvent?.('viewportChanged', update);
    };
  }, [enabled]);

  return layout;
}
