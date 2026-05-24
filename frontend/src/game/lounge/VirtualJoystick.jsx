import { useRef, useState } from 'react';

const RADIUS = 54;
const KNOB_RADIUS = 22;

/**
 * Ограничивает значение в диапазоне.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Виртуальный джойстик для управления игроком на телефоне.
 * @param {{ onChange: (vector: { x: number, y: number }) => void }} props
 */
export function VirtualJoystick({ onChange }) {
  const rootRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  /**
   * Обновляет положение стика по pointer-событию.
   * @param {React.PointerEvent<HTMLDivElement>} event
   */
  function updatePointer(event) {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > RADIUS ? RADIUS / distance : 1;
    const x = clamp(rawX * scale, -RADIUS, RADIUS);
    const y = clamp(rawY * scale, -RADIUS, RADIUS);

    setKnob({ x, y });
    onChange({ x: x / RADIUS, y: y / RADIUS });
  }

  /**
   * Сбрасывает джойстик в центр.
   */
  function reset() {
    setKnob({ x: 0, y: 0 });
    onChange({ x: 0, y: 0 });
  }

  return (
    <div
      ref={rootRef}
      className="lounge-joystick"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        updatePointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePointer(event);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      role="application"
      aria-label="Джойстик движения"
    >
      <div
        className="lounge-joystick-knob"
        style={{ transform: `translate(${knob.x - KNOB_RADIUS}px, ${knob.y - KNOB_RADIUS}px)` }}
      />
    </div>
  );
}
