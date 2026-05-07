import { createContext, useContext, useReducer } from 'react';

const CartContext = createContext(null);

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD': {
      const existing = state.find(i => i.product_id === action.item.product_id);
      if (existing) {
        return state.map(i => i.product_id === action.item.product_id
          ? { ...i, qty: i.qty + 1 }
          : i
        );
      }
      return [...state, { ...action.item, qty: 1 }];
    }
    case 'REMOVE':
      return state.filter(i => i.product_id !== action.product_id);
    case 'DEC': {
      const item = state.find(i => i.product_id === action.product_id);
      if (!item) return state;
      if (item.qty <= 1) return state.filter(i => i.product_id !== action.product_id);
      return state.map(i => i.product_id === action.product_id ? { ...i, qty: i.qty - 1 } : i);
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
