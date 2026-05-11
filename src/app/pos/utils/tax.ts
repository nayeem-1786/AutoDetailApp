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
 * Calculate all ticket totals from items, discounts, deposit credit, and
 * any prior payments already received against the linked appointment.
 *
 * `depositCredit` and `priorPaymentsTotal` are kept as separate explicit
 * subtractions on purpose — they mean different things in the data model
 * (deposit_amount column on appointments vs. payments rows on the
 * appointment) and need to remain debuggable.
 */
export function calculateTicketTotals(
  items: TicketItem[],
  discountAmount: number = 0,
  depositCredit: number = 0,
  priorPaymentsTotal: number = 0,
  mobileSurcharge: number = 0
) {
  const itemsSubtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const subtotal = itemsSubtotal + mobileSurcharge;
  const taxAmount = items.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = Math.max(
    0,
    subtotal + taxAmount - discountAmount - depositCredit - priorPaymentsTotal
  );

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}
