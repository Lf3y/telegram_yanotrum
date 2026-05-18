import { createContext, useContext, useReducer } from 'react';

const CartContext = createContext(null);

/**
 * По данным SKU: лимит штук в корзине; `-1` / бесконечность — без лимита.
 * @param {unknown} stockQty
 * @returns {number}
 */
function maxQtyForStock(stockQty) {
  if (stockQty === undefined || stockQty === null || stockQty === '') {
    return Number.POSITIVE_INFINITY;
  }
  const n = Number(stockQty);
  if (!Number.isFinite(n) || n < 0) {
    return Number.POSITIVE_INFINITY;
  }
  return n;
}

/**
 * Отображение позиции: бренд + название как в заказах.
 * @param {{ name: string, brand?: string|null }} item
 */
export function cartLineTitle(item) {
  const nm = item?.name ? String(item.name).trim() : '';
  const br = item?.brand ? String(item.brand).trim() : '';
  if (br) return `${br} · ${nm}`;
  return nm;
}

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD': {
      const cap = maxQtyForStock(action.item.stock_qty);
      const existing = state.find((i) => i.product_id === action.item.product_id);
      const nextQty = existing ? existing.qty + 1 : 1;
      if (nextQty > cap) return state;

      const base = existing || {
        ...action.item,
      };

      if (existing) {
        return state.map((i) =>
          i.product_id === action.item.product_id
            ? {
              ...i,
              qty: nextQty,
              stock_qty: action.item.stock_qty ?? i.stock_qty,
              price: Number.isFinite(Number(action.item.price)) ? Number(action.item.price) : i.price,
            }
            : i,
        );
      }
      return [...state, { ...base, qty: 1 }];
    }
    case 'REMOVE':
      return state.filter((i) => i.product_id !== action.product_id);
    case 'DEC': {
      const item = state.find((i) => i.product_id === action.product_id);
      if (!item) return state;
      if (item.qty <= 1) return state.filter((i) => i.product_id !== action.product_id);
      return state.map((i) => (i.product_id === action.product_id ? { ...i, qty: i.qty - 1 } : i));
    }
    case 'CLEAR':
      return [];
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(cartReducer, []);
  return (
    <CartContext.Provider value={{ cart, dispatch }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
