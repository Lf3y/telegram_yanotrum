import { useState } from 'react';

/** @typedef {'xs'|'sm'|'md'|'lg'|'xl'} IconSize */

const SIZES = { xs: 14, sm: 18, md: 22, lg: 28, xl: 36 };

/**
 * @param {{ name: string, size?: IconSize, className?: string, strokeWidth?: number }} props
 */
export function Icon({ name, size = 'md', className = '', strokeWidth = 1.75 }) {
  const px = SIZES[size] || SIZES.md;
  const common = {
    width: px,
    height: px,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: `ui-icon ${className}`.trim(),
    'aria-hidden': true,
  };

  switch (name) {
    case 'compass':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none" opacity="0.85" />
        </svg>
      );
    case 'cart':
      return (
        <svg {...common}>
          <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case 'filter':
      return (
        <svg {...common}>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      );
    case 'tag':
      return (
        <svg {...common}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
    case 'package':
      return (
        <svg {...common}>
          <path d="M16.5 9.4 7.55 4.24" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.29 7 12 12 20.71 7" /><line x1="12" y1="22" x2="12" y2="12" />
        </svg>
      );
    case 'clipboard':
      return (
        <svg {...common}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        </svg>
      );
    case 'note':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg {...common}>
          <path d="M12 3l1.2 4.2L17.5 8.5l-4.3 1.2L12 14l-1.2-4.3L6.5 8.5l4.3-1.2L12 3z" fill="currentColor" stroke="none" />
          <path d="M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14z" fill="currentColor" stroke="none" opacity="0.7" />
          <path d="M5 16l.5 1.8L7.3 18.3 5.5 19l-.5 1.8L4.5 19 2.7 18.3 4.5 17.8 5 16z" fill="currentColor" stroke="none" opacity="0.55" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    case 'droplet':
      return (
        <svg {...common}>
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z" />
        </svg>
      );
    case 'battery':
      return (
        <svg {...common}>
          <rect x="1" y="6" width="18" height="12" rx="2" ry="2" /><line x1="23" y1="13" x2="23" y2="11" />
          <rect x="4" y="9" width="8" height="6" rx="1" fill="currentColor" stroke="none" opacity="0.35" />
        </svg>
      );
    case 'leaf':
      return (
        <svg {...common}>
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
        </svg>
      );
    case 'zap':
      return (
        <svg {...common}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'cpu':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
          <rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
          <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
          <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
        </svg>
      );
    case 'image-off':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
          <line x1="3" y1="3" x2="21" y2="21" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

/**
 * SVG-иконка категории по slug (без emoji из БД).
 * @param {{ slug?: string|null, name?: string|null, size?: IconSize, className?: string }} props
 */
export function CategoryIcon({ slug, name, size = 'lg', className = '' }) {
  const s = String(slug || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  let icon = 'grid';
  if (s.includes('cartridge') || n.includes('картридж')) icon = 'battery';
  else if (s.includes('liquid') || s.includes('zhid') || n.includes('жидк')) icon = 'droplet';
  else if (s.includes('snus') || n.includes('снюс')) icon = 'leaf';
  else if (s.includes('disposable') || n.includes('однораз')) icon = 'zap';
  else if (s.includes('pod') || n.includes('pod')) icon = 'cpu';
  return <Icon name={icon} size={size} className={className} />;
}

/**
 * @param {{ src?: string|null, alt?: string, className?: string, placeholderIcon?: string }} props
 */
export function ProductImage({ src, alt = '', className = '', placeholderIcon = 'package' }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`product-image-fallback ${className}`.trim()}>
        <Icon name={placeholderIcon} size="md" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
