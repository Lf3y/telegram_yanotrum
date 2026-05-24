import { useEffect } from 'react';

const SPLASH_MS = 2000;

/**
 * Intro-загрузка при каждом открытии Mini App.
 * @param {{ onFinish: () => void }} props
 */
export function SplashScreen({ onFinish }) {
  useEffect(() => {
    const timer = window.setTimeout(onFinish, SPLASH_MS);
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
