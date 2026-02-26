'use client';

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CartItem {
  id: string;
  name: string;
  slug: string;
  categorySlug: string;
  price: number; // retail_price in dollars
  quantity: number;
  maxQuantity: number; // stock limit
  imageUrl: string | null;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  hydrated: boolean;
}

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type CartAction =
  | { type: 'HYDRATE'; items: CartItem[] }
  | { type: 'ADD_ITEM'; item: Omit<CartItem, 'quantity'>; quantity: number }
  | { type: 'REMOVE_ITEM'; id: string }
  | { type: 'UPDATE_QUANTITY'; id: string; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'OPEN_CART' }
  | { type: 'CLOSE_CART' }
  | { type: 'TOGGLE_CART' };

const STORAGE_KEY = 'smart-details-cart';

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, items: action.items, hydrated: true };

    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.id === action.item.id);

      if (existing) {
        const newQty = existing.quantity + action.quantity;
        if (newQty > existing.maxQuantity) {
          toast.error(`Maximum quantity reached for ${existing.name}`);
          return state;
        }
        return {
          ...state,
          items: state.items.map((i) =>
            i.id === action.item.id ? { ...i, quantity: newQty } : i
          ),
        };
      }

      if (action.item.maxQuantity <= 0) {
        toast.error(`${action.item.name} is out of stock`);
        return state;
      }

      const qty = Math.min(action.quantity, action.item.maxQuantity);
      return {
        ...state,
        items: [...state.items, { ...action.item, quantity: qty }],
      };
    }

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
      };

    case 'UPDATE_QUANTITY': {
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter((i) => i.id !== action.id),
        };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id
            ? { ...i, quantity: Math.min(action.quantity, i.maxQuantity) }
            : i
        ),
      };
    }

    case 'CLEAR':
      return { ...state, items: [] };

    case 'OPEN_CART':
      return { ...state, isOpen: true };

    case 'CLOSE_CART':
      return { ...state, isOpen: false };

    case 'TOGGLE_CART':
      return { ...state, isOpen: !state.isOpen };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
    isOpen: false,
    hydrated: false,
  });

  // Hydrate from localStorage on mount (client only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CartItem[];
        if (Array.isArray(parsed)) {
          dispatch({ type: 'HYDRATE', items: parsed });
          return;
        }
      }
    } catch {
      // Ignore parse errors
    }
    dispatch({ type: 'HYDRATE', items: [] });
  }, []);

  // Persist to localStorage on every item change (after hydration)
  useEffect(() => {
    if (state.hydrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
      } catch {
        // Storage quota exceeded — ignore
      }
    }
  }, [state.items, state.hydrated]);

  const addItem = useCallback(
    (item: Omit<CartItem, 'quantity'>, quantity = 1) => {
      if (item.maxQuantity <= 0) {
        toast.error(`${item.name} is out of stock`);
        return;
      }

      const existing = state.items.find((i) => i.id === item.id);
      if (existing && existing.quantity >= existing.maxQuantity) {
        toast.error(`Maximum quantity reached for ${item.name}`);
        return;
      }

      dispatch({ type: 'ADD_ITEM', item, quantity });
      toast.success(`Added ${item.name} to cart`);
      dispatch({ type: 'OPEN_CART' });
    },
    [state.items]
  );

  const removeItem = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_ITEM', id });
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QUANTITY', id, quantity });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const openCart = useCallback(() => dispatch({ type: 'OPEN_CART' }), []);
  const closeCart = useCallback(() => dispatch({ type: 'CLOSE_CART' }), []);
  const toggleCart = useCallback(() => dispatch({ type: 'TOGGLE_CART' }), []);

  const itemCount = useMemo(
    () => state.items.reduce((sum, i) => sum + i.quantity, 0),
    [state.items]
  );

  const subtotal = useMemo(
    () => state.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [state.items]
  );

  const value = useMemo<CartContextType>(
    () => ({
      items: state.items,
      itemCount,
      subtotal,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      isCartOpen: state.isOpen,
      openCart,
      closeCart,
      toggleCart,
    }),
    [
      state.items,
      state.isOpen,
      itemCount,
      subtotal,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      openCart,
      closeCart,
      toggleCart,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextType {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
}
