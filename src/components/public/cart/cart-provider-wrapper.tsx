'use client';

import { CartProvider } from '@/lib/contexts/cart-context';

export function CartProviderWrapper({ children }: { children: React.ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}
