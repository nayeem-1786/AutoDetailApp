/**
 * Receipt composer — Phase 0b.1.
 *
 * Pure data-shaping module that consolidates the appointment-payment
 * aggregation, balance-due math, and refund overlay logic that today lives
 * in three places:
 *   - src/lib/data/receipt-data.ts (HTML/email/thermal data fetch)
 *   - src/app/(public)/receipt/[token]/page.tsx (public receipt page)
 *   - src/app/api/pos/jobs/[id]/checkout-items/route.ts (POS ticket)
 *
 * Phase 0b.1 LOCKED-2: NO DB ACCESS. All functions take pre-fetched data.
 * Phase 0b.1 LOCKED-1: NO visual output changes — composer produces
 * intermediate structured data; existing renderers continue using their
 * label-construction logic. Phase 1 will switch renderers to consume
 * suggested_* fields here.
 */

import { toCents } from '@/lib/utils/refund-math';
import {
  derivePaymentSourceLabel,
  type PaymentMethodLike,
} from '@/lib/utils/payment-source-label';
import { formatCardBrand } from '@/lib/utils/card-brand';

// ---------------------------------------------------------------------------
// Vocabulary constants — LOCKED-4
// ---------------------------------------------------------------------------
//
// Centralized so Phase 1 verbiage swaps happen in one place. Phase 0b.1
// surfaces continue to use their existing string literals; these are
// available for opt-in adoption.

export const RECEIPT_VOCAB = {
  PAYMENT_SECTION: 'Payment(s)',
  TOTAL_PAID: 'Total Paid:',
  BALANCE_DUE: 'Balance Due:',
  PAID_IN_FULL_HTML: 'Paid in Full ✓',
  PAID_IN_FULL_THERMAL: 'Paid in Full [v]',
  CUSTOMER: 'Customer:',
  VEHICLE: 'Vehicle:',
  DATE: 'Date:',
  DEPOSIT_ONLINE: 'Deposit (Online)',
  DEPOSIT_IN_STORE: 'Deposit (In-Store)',
  PAY_LINK_ONLINE: 'Pay Link (Online)',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentSource = 'online_booking_deposit' | 'online_pay_link' | 'in_store';

/** Shape of a payment row coming in (raw from DB or from joined receipt data). */
export interface ComposerPaymentInput {
  id?: string;
  method: string; // 'cash' | 'card' | 'check' | 'split' (others fall through)
  amount: number; // dollars
  tip_amount?: number | null;
  card_brand?: string | null;
  card_last_four?: string | null;
  cash_tendered?: number | null;
  change_given?: number | null;
  created_at?: string | null;
  /** When fetched via the appointment-history join, the joined transaction
   *  carries notes used for source detection. Either pass the source-bearing
   *  notes verbatim here, OR pre-derive `source_label` and pass it. */
  source_notes?: string | null;
  /** Pre-derived source_label (compatibility with rows already enriched
   *  by receipt-data.ts before being handed to renderers). When present
   *  it short-circuits source_notes-based detection. */
  source_label?: string | null;
  stripe_payment_intent_id?: string | null;
}

export interface RenderedPaymentLine {
  payment_id: string;
  /** Short date "5/6" (MM/D, en-US LA tz). */
  date_short: string;
  /** Long date "May 6, 2026, 1:43 PM" (en-US LA tz, matches formatReceiptDateTime). */
  date_long: string;
  /** Source enum derived from notes prefix per LOCKED-5. */
  source: PaymentSource;
  /** True when this is the chronologically-first payment row in the block. */
  is_first_payment: boolean;
  /** True when this is the first payment AND a balance remains after it
   *  applies (i.e., it's effectively a "deposit"). Phase 1's depository-aware
   *  label rendering keys off this. */
  is_first_with_remainder: boolean;
  method: string;
  card_brand: string | null;
  card_last_four: string | null;
  amount_cents: number; // POSITIVE in Phase 0b.1
  cash_tendered_cents: number | null;
  change_given_cents: number | null;
  tip_amount_cents: number;
  /** Suggested label parts for Phase 1 consumption. Phase 0b.1 renderers
   *  ignore these and continue using their inline label construction. */
  suggested_primary_label: string;
  suggested_method_detail: string;
  suggested_label_combined: string;
}

export interface RenderedPaymentBlock {
  lines: RenderedPaymentLine[];
  total_paid_cents: number;
  /** Math.max(0, appointment_total_cents - total_paid_cents). Always >= 0. */
  balance_due_cents: number;
  /** Cents form of the appointment.total_amount input. Zero when the caller
   *  passes appointment=null (walk-in legacy path / non-appointment-linked tx). */
  appointment_total_cents: number;
  is_paid_in_full: boolean;
}

export interface ComposerRefundInputItem {
  id: string;
  transaction_item_id: string;
  quantity: number;
  amount: number;
}

export interface ComposerRefundInput {
  id: string;
  amount: number;
  status: string;
  reason: string | null;
  points_clawed_back: number;
  points_restored: number;
  created_at: string;
  refund_items: ComposerRefundInputItem[];
}

export interface ComposerItemInput {
  id: string;
  quantity: number;
  total_price: number;
  // remaining ReceiptItem fields not needed for refund overlay
}

export interface RenderedRefundBlock {
  /** 'none' if all refunds are non-processed; 'partial' if any items remain
   *  un-refunded after applying processed refunds; 'full' if every item is
   *  fully refunded. Mirrors getRefundStatus in receipt-template.ts. */
  refund_status: 'none' | 'partial' | 'full';
  /** Map of transaction_item_id → aggregate refunded {qty, amount_cents}.
   *  Only counts processed refunds. */
  refunded_item_map: Map<string, { qty: number; amount_cents: number }>;
}

export interface ComposerTotalsInput {
  subtotal: number;
  tax_amount: number;
  discount_amount: number; // aggregate (manual + coupon + loyalty)
  loyalty_discount?: number | null;
  loyalty_points_redeemed?: number | null;
  coupon_code?: string | null;
  tip_amount: number;
  total_amount: number;
}

export interface RenderedTotalsBlock {
  subtotal_cents: number;
  tax_cents: number;
  /** Manual + coupon discount (loyalty NOT included). */
  discount_cents: number;
  loyalty_discount_cents: number;
  loyalty_points_redeemed: number;
  coupon_code: string | null;
  tip_cents: number;
  /** Raw total_amount in cents (transaction-only — does NOT apply the
   *  Math.max(appointment_total, total_amount) policy that the renderer
   *  uses for the displayed grand total). */
  total_charged_cents: number;
}

// ---------------------------------------------------------------------------
// Source detection (LOCKED-5)
// ---------------------------------------------------------------------------

/**
 * Map raw notes prefix → composer's PaymentSource enum.
 * Mirrors the discriminator used by derivePaymentSourceLabel — keep in sync
 * if either prefix string changes.
 */
export function detectPaymentSource(
  notes: string | null | undefined
): PaymentSource {
  if (notes && notes.startsWith('Online payment link.')) return 'online_pay_link';
  if (notes && notes.startsWith('Online booking deposit.')) return 'online_booking_deposit';
  return 'in_store';
}

/**
 * Reverse-derive PaymentSource from a pre-computed source_label string
 * (the receipt-data.ts intermediate). Used when a payment row already
 * carries source_label from upstream and the original notes aren't
 * available.
 */
function sourceFromLabel(label: string | null | undefined): PaymentSource {
  if (label === 'Online (pay link)') return 'online_pay_link';
  if (label === 'Booking deposit') return 'online_booking_deposit';
  return 'in_store';
}

// ---------------------------------------------------------------------------
// Date formatters
// ---------------------------------------------------------------------------

const LA_TZ = 'America/Los_Angeles';

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TZ,
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(iso));
}

function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Suggested label builder (Phase 1 informational)
// ---------------------------------------------------------------------------

/**
 * Construct a suggested primary label for a payment line per Phase 1 rules:
 *   - first-payment-with-remainder + online_booking_deposit → 'Deposit (Online)'
 *   - first-payment-with-remainder + in_store              → 'Deposit (In-Store)'
 *   - online_pay_link                                       → 'Pay Link (Online)'
 *   - online_booking_deposit (non-first-with-remainder)     → 'Deposit (Online)'
 *   - method=cash → 'Cash'; check → 'Check'; card → 'Card'
 *
 * Phase 0b.1 surfaces ignore these. Phase 1 will adopt.
 */
export function buildSuggestedPaymentLabel(line: RenderedPaymentLine): string {
  if (line.is_first_with_remainder) {
    if (line.source === 'online_booking_deposit') return RECEIPT_VOCAB.DEPOSIT_ONLINE;
    if (line.source === 'in_store') return RECEIPT_VOCAB.DEPOSIT_IN_STORE;
  }
  if (line.source === 'online_pay_link') return RECEIPT_VOCAB.PAY_LINK_ONLINE;
  if (line.source === 'online_booking_deposit') return RECEIPT_VOCAB.DEPOSIT_ONLINE;
  switch (line.method) {
    case 'cash': return 'Cash';
    case 'check': return 'Check';
    case 'card': return 'Card';
    default: return line.method;
  }
}

function buildMethodDetail(line: Pick<RenderedPaymentLine, 'method' | 'card_brand' | 'card_last_four'>): string {
  if (line.method === 'card' && line.card_brand) {
    return `${formatCardBrand(line.card_brand)} ****${line.card_last_four ?? '????'}`;
  }
  switch (line.method) {
    case 'cash': return 'Cash';
    case 'check': return 'Check';
    case 'card': return 'Card';
    case 'split': return 'Split';
    default: return line.method;
  }
}

// ---------------------------------------------------------------------------
// Payment composer
// ---------------------------------------------------------------------------

/**
 * Compose a payment block from a flat list of payment rows + optional
 * appointment context. Sorts chronologically (created_at ASC), derives
 * source per row, and computes total_paid + balance_due against the
 * appointment total.
 *
 * When `appointment` is null (legacy walk-in path with appointment_id IS NULL),
 * appointment_total_cents = 0 and balance_due_cents = 0 — callers that need
 * a non-aggregated balance should rely on the transaction's own totals.
 */
export function composeReceiptPaymentLines(
  payments: ComposerPaymentInput[],
  appointment: { total_amount: number } | null
): RenderedPaymentBlock {
  // Chronological sort. Rows missing created_at fall to the end stably.
  const sorted = [...payments].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.created_at ? new Date(b.created_at).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  const appointmentTotalCents = appointment
    ? toCents(Number(appointment.total_amount))
    : 0;

  let runningPaidCents = 0;
  const rawLines: Array<RenderedPaymentLine & { _index: number }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const amountCents = toCents(Number(p.amount));
    runningPaidCents += amountCents;

    // Source: prefer notes when present, else fall back to upstream-derived
    // source_label, else default to in_store.
    const source: PaymentSource = p.source_notes !== undefined
      ? detectPaymentSource(p.source_notes)
      : p.source_label !== undefined && p.source_label !== null
        ? sourceFromLabel(p.source_label)
        : 'in_store';

    const isFirst = i === 0;
    const isFirstWithRemainder = isFirst
      && appointmentTotalCents > 0
      && runningPaidCents < appointmentTotalCents;

    const line: RenderedPaymentLine & { _index: number } = {
      _index: i,
      payment_id: p.id ?? '',
      date_short: formatDateShort(p.created_at),
      date_long: formatDateLong(p.created_at),
      source,
      is_first_payment: isFirst,
      is_first_with_remainder: isFirstWithRemainder,
      method: p.method,
      card_brand: p.card_brand ?? null,
      card_last_four: p.card_last_four ?? null,
      amount_cents: amountCents,
      cash_tendered_cents: p.cash_tendered != null ? toCents(Number(p.cash_tendered)) : null,
      change_given_cents: p.change_given != null ? toCents(Number(p.change_given)) : null,
      tip_amount_cents: p.tip_amount != null ? toCents(Number(p.tip_amount)) : 0,
      // Filled below.
      suggested_primary_label: '',
      suggested_method_detail: '',
      suggested_label_combined: '',
    };

    line.suggested_primary_label = buildSuggestedPaymentLabel(line);
    line.suggested_method_detail = buildMethodDetail(line);
    // Combined: "Cash · 5/6" / "Pay Link (Online) · May 6, 2026, 1:43 PM" /
    // "Amex ****1074 · 5/6". Phase 1 surfaces will pick combined or split.
    const isOnline = source === 'online_pay_link' || source === 'online_booking_deposit';
    const dateForCombined = isOnline ? line.date_long : line.date_short;
    line.suggested_label_combined = dateForCombined
      ? `${line.suggested_primary_label} · ${dateForCombined}`
      : line.suggested_primary_label;

    rawLines.push(line);
  }

  const totalPaidCents = runningPaidCents;
  const balanceDueCents = Math.max(0, appointmentTotalCents - totalPaidCents);
  const isPaidInFull = appointment != null && balanceDueCents === 0 && totalPaidCents > 0;

  return {
    lines: rawLines.map(({ _index: _ignored, ...rest }) => rest),
    total_paid_cents: totalPaidCents,
    balance_due_cents: balanceDueCents,
    appointment_total_cents: appointmentTotalCents,
    is_paid_in_full: isPaidInFull,
  };
}

// ---------------------------------------------------------------------------
// Refund composer
// ---------------------------------------------------------------------------

/**
 * Aggregate processed refunds into a per-item map and compute overall
 * refund_status. Mirrors the inline logic in receipt-template.ts:
 *   - buildRefundedMap (per-item qty + amount aggregation)
 *   - getRefundStatus (none / partial / full)
 *
 * Only refunds with status='processed' contribute. Pending/cancelled refunds
 * are ignored on the receipt (consistent with current renderer behavior).
 */
export function composeReceiptRefunds(
  refunds: ComposerRefundInput[] | undefined,
  items: ComposerItemInput[]
): RenderedRefundBlock {
  const map = new Map<string, { qty: number; amount_cents: number }>();
  if (!refunds || refunds.length === 0) {
    return { refund_status: 'none', refunded_item_map: map };
  }

  const processed = refunds.filter((r) => r.status === 'processed');
  if (processed.length === 0) {
    return { refund_status: 'none', refunded_item_map: map };
  }

  for (const refund of processed) {
    for (const ri of refund.refund_items ?? []) {
      const existing = map.get(ri.transaction_item_id) ?? { qty: 0, amount_cents: 0 };
      existing.qty += ri.quantity;
      existing.amount_cents += toCents(Number(ri.amount));
      map.set(ri.transaction_item_id, existing);
    }
  }

  if (map.size === 0) {
    return { refund_status: 'none', refunded_item_map: map };
  }

  // Full refund: every item's quantity is fully covered AND total refunded
  // amount across all sources matches the sum of item totals (loose match
  // since items can be refunded at non-full prices; mirror existing logic).
  let isFullRefund = true;
  for (const item of items) {
    const refunded = map.get(item.id);
    if (!refunded || refunded.qty < item.quantity) {
      isFullRefund = false;
      break;
    }
  }

  return {
    refund_status: isFullRefund ? 'full' : 'partial',
    refunded_item_map: map,
  };
}

// ---------------------------------------------------------------------------
// Totals composer
// ---------------------------------------------------------------------------

/**
 * Project transaction money fields into integer-cents form. Phase 0b.1
 * surfaces still consume the dollar fields; this is provided for Phase 1
 * adoption. Discount is split into manual+coupon vs loyalty per existing
 * receipt-template policy (loyalty rendered as its own line).
 */
export function composeReceiptTotals(
  input: ComposerTotalsInput
): RenderedTotalsBlock {
  const loyaltyDiscount = Number(input.loyalty_discount ?? 0);
  const totalDiscount = Number(input.discount_amount ?? 0);
  const nonLoyaltyDiscount = Math.max(0, totalDiscount - loyaltyDiscount);
  return {
    subtotal_cents: toCents(Number(input.subtotal)),
    tax_cents: toCents(Number(input.tax_amount)),
    discount_cents: toCents(nonLoyaltyDiscount),
    loyalty_discount_cents: toCents(loyaltyDiscount),
    loyalty_points_redeemed: Number(input.loyalty_points_redeemed ?? 0),
    coupon_code: input.coupon_code ?? null,
    tip_cents: toCents(Number(input.tip_amount)),
    total_charged_cents: toCents(Number(input.total_amount)),
  };
}

// ---------------------------------------------------------------------------
// Compatibility helper — derive receipt-data.ts's `source_label` shape
// ---------------------------------------------------------------------------

/**
 * Map a composer PaymentSource back to the human-readable label string that
 * receipt-data.ts has historically attached as `source_label` on each
 * payment row. Used during the Phase 0b.1 receipt-data.ts switch to
 * preserve the existing ReceiptTransaction.payments[].source_label
 * contract that downstream renderers consume.
 */
export function sourceToLabel(
  source: PaymentSource,
  method: PaymentMethodLike
): string {
  if (source === 'online_pay_link') return 'Online (pay link)';
  if (source === 'online_booking_deposit') return 'Booking deposit';
  // Fallback to the method-based label (matches derivePaymentSourceLabel).
  return derivePaymentSourceLabel(null, method);
}
