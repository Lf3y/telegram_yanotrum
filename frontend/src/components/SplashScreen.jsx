import { useEffect } from 'react';

const SPLASH_MS = 2000;
const STORAGE_KEY = 'vape_shop_intro_seen';

/** @returns {boolean} */
export function shouldShowIntroSplash() {
  if (typeof window === 'undefined') return false;
  try {
    return !window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

/**
 * Одноразовый intro при первом открытии Mini App.
 * @param {{ onFinish: () => void }} props
 */
export function SplashScreen({ onFinish }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        /** ignore */
      }
      onFinish();
    }, SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="splash" role="status" aria-label="Загрузка">
      <div className="splash-smoke-side splash-smoke-side--left" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="splash-wisp" style={{ '--i': i }} />
        ))}
      </div>
      <div className="splash-smoke-side splash-smoke-side--right" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="splash-wisp splash-wisp--mirror" style={{ '--i': i }} />
        ))}
      </div>

      <div className="splash-vignette" aria-hidden="true" />

      <div className="splash-core">
        <div className="splash-logo-ring" aria-hidden="true" />
        <h1 className="splash-logo">
          <span className="splash-logo-line">VAPE</span>
          <span className="splash-logo-accent">SHOP</span>
        </h1>
        <div className="splash-loader" aria-hidden="true">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}
