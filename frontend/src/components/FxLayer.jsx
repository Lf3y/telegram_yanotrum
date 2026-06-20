import { useEffect, useRef } from 'react';
import { FLY_TO_CART_EVENT, burstSmoke } from '../lib/fx';
import { hapticImpact } from '../lib/haptics';

/** Длительность анимации полёта частицы в корзину, мс. */
const FLY_DURATION = 620;

/**
 * Невидимый оверлей-слой эффектов. Анимирует «полёт товара в корзину»:
 * светящаяся частица летит из точки-источника к иконке корзины в нижнем меню,
 * по прибытии пускает всплеск дыма и подсвечивает иконку.
 * Не перехватывает события (pointer-events: none).
 *
 * @returns {JSX.Element}
 */
export default function FxLayer() {
  const layerRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || typeof window === 'undefined') return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** @param {Event} event */
    const handleFly = (event) => {
      const detail = /** @type {CustomEvent} */ (event).detail || {};
      const anchor = document.getElementById('cart-fly-anchor');
      const targetRect = anchor?.getBoundingClientRect();
      const toX = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2;
      const toY = targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight - 40;

      const arrive = () => {
        burstSmoke(toX, toY, 0.8);
        hapticImpact('light');
        if (anchor) {
          anchor.classList.remove('cart-pulse');
          void anchor.offsetWidth;
          anchor.classList.add('cart-pulse');
        }
      };

      if (reduceMotion) {
        arrive();
        return;
      }

      const fromX = detail.x ?? toX;
      const fromY = detail.y ?? toY;
      const orb = document.createElement('span');
      orb.className = 'fx-flyer';
      layer.appendChild(orb);

      const midX = (fromX + toX) / 2 + (Math.random() - 0.5) * 40;
      const midY = Math.min(fromY, toY) - 70;

      const animation = orb.animate(
        [
          { transform: `translate(${fromX}px, ${fromY}px) scale(1)`, opacity: 1 },
          { transform: `translate(${midX}px, ${midY}px) scale(1.1)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${toX}px, ${toY}px) scale(0.35)`, opacity: 0.5 },
        ],
        { duration: FLY_DURATION, easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)', fill: 'forwards' },
      );

      animation.onfinish = () => {
        orb.remove();
        arrive();
      };
      animation.oncancel = () => orb.remove();
    };

    window.addEventListener(FLY_TO_CART_EVENT, handleFly);
    return () => window.removeEventListener(FLY_TO_CART_EVENT, handleFly);
  }, []);

  return <div ref={layerRef} className="fx-layer" aria-hidden="true" />;
}
