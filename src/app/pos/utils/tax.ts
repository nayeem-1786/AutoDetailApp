import { TAX_RATE } from '@/lib/utils/constants';
import type { TicketItem } from '../types';

/**
 * Calculate tax for a single item.
 * Only taxable items (products) get taxed; services are tax-free.
 */
export function calculateItemTax(price: number, isTaxable: boolean): number {
  if (!isTaxable) return 0;
  return Math.round(price * TAX_RATE * 100) / 100;
}

/**
 * Calculate all ticket totals from items and discounts.
 */
export function calculateTicketTotals(
  items: TicketItem[],
  discountAmount: number = 0
) {
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxAmount = items.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = Math.max(0, subtotal + taxAmount - discountAmount);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}
