/**
 * Живой Liquid Gradient фон: плывущие цветные блобы + медленная «аврора».
 * Чисто декоративный слой, лежит под всем контентом и не ловит события.
 */
export default function LiquidBackground() {
  return (
    <div className="liquid-bg" aria-hidden="true">
      <div className="liquid-aurora" />
      <div className="liquid-blob liquid-blob--violet" />
      <div className="liquid-blob liquid-blob--pink" />
      <div className="liquid-blob liquid-blob--cyan" />
      <div className="liquid-blob liquid-blob--teal" />
    </div>
  );
}
