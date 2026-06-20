/**
 * Лёгкие визуальные мини-эффекты интерфейса.
 * Триггерятся через CustomEvent, а слои-компоненты (AmbientSmoke, FxLayer)
 * слушают их и проигрывают анимацию. Такой подход держит эффекты
 * полностью отделёнными от бизнес-логики страниц.
 */

export const SMOKE_BURST_EVENT = 'fx:smoke-burst';
export const FLY_TO_CART_EVENT = 'fx:fly-to-cart';

/**
 * @typedef {Object} SmokeBurstDetail
 * @property {number} x      Координата X в пикселях вьюпорта.
 * @property {number} y      Координата Y в пикселях вьюпорта.
 * @property {number} power  Сила всплеска (множитель числа частиц/размера).
 */

/**
 * @typedef {Object} FlyToCartDetail
 * @property {number} x Стартовая координата X в пикселях вьюпорта.
 * @property {number} y Стартовая координата Y в пикселях вьюпорта.
 */

/**
 * Пускает всплеск дыма в заданной точке экрана.
 * @param {number} x
 * @param {number} y
 * @param {number} [power]
 * @returns {void}
 */
export const burstSmoke = (x, y, power = 1) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(SMOKE_BURST_EVENT, { detail: { x, y, power } }),
  );
};

/**
 * Запускает анимацию «полёта товара в корзину» из элемента-источника.
 * @param {Element | null | undefined} sourceEl Элемент, от центра которого летит частица.
 * @returns {void}
 */
export const flyToCart = (sourceEl) => {
  if (typeof window === 'undefined' || !sourceEl?.getBoundingClientRect) return;
  const rect = sourceEl.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  window.dispatchEvent(new CustomEvent(FLY_TO_CART_EVENT, { detail: { x, y } }));
};
