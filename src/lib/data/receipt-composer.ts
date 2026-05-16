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
import { formatReceiptDateTimeCompact, toTitleCase } from '@/lib/utils/format';

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
  // Phase 1A-followup-2: PAID_IN_FULL_HTML + PAID_IN_FULL_THERMAL consolidated
  // into one constant. The literal '✓' character is universal across HTML /
  // public / email surfaces (UTF-8 native) AND thermal — the receipt-template's
  // THERMAL_SUBSTITUTIONS maps '✓' → CP437 byte 0xFB (√, the industry-standard
  // thermal "almost-check" glyph; CP437 has no exact ✓).
  PAID_IN_FULL_INDICATOR: 'Paid in Full ✓',
  CUSTOMER: 'Customer:',
  VEHICLE: 'Vehicle:',
  DATE: 'Date:',
  // Wave-1 Item 6: deposit label unification. Prior split between
  // "Deposit (Online)" / "Deposit (In-Store)" removed — customers don't
  // benefit from the distinction. When the deposit equals or exceeds the
  // ticket total (subtotal + tax + tip), label flips to PAID_IN_FULL.
  // Distinct from PAID_IN_FULL_INDICATOR ('Paid in Full ✓'), which is the
  // balance-zero banner below the payment block.
  DEPOSIT: 'Deposit',
  PAID_IN_FULL: 'Paid In Full',
  PAY_LINK_ONLINE: 'Pay Link (Online)',
  // Loyalty redemption stays in the discount section above TOTAL —
  // CDTFA Reg 1671.1 treats loyalty redemption as a discount that reduces
  // the taxable base, NOT a tender. Phase 1A REVISED LOCKED-7.
  LOYALTY_LABEL: 'Loyalty Discount',
  // Loyalty footer (below Balance Due / Paid in Full).
  LOYALTY_REDEEMED_PREFIX: 'Loyalty redeemed:',
  LOYALTY_BALANCE_PREFIX: 'Loyalty balance:',
  LOYALTY_BALANCE_SUFFIX: 'pts remaining',
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
  /** Phase 1A.5: canonical digital platform identifier (lowercase) when
   *  method='digital'. Composer maps via mapDigitalPlatformToFriendly to
   *  produce the receipt-visible primary label. NULL/undefined for all
   *  non-digital methods. */
  digital_platform?: string | null;
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
  /** Phase 1A.5: canonical digital platform identifier (lowercase). NULL
   *  for all non-digital methods. Composer surfaces the receipt-visible
   *  label via mapDigitalPlatformToFriendly on the primary label. */
  digital_platform: string | null;
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
 * Phase 1A.5 Part A: map a canonical lowercase digital_platform identifier
 * to its receipt-visible label. Three fixed identifiers get hand-styled
 * labels; everything else is title-cased.
 *
 * Examples:
 *   'zelle'          → 'Zelle'
 *   'venmo'          → 'Venmo'
 *   'apple_cash'     → 'AppleCash'    (intentional camelCase to match the
 *                                       brand wordmark — toTitleCase would
 *                                       drop the underscore)
 *   'cash app'       → 'Cash App'
 *   'wise transfer'  → 'Wise Transfer'
 *   ''               → 'Digital'      (defensive fallback for corrupt rows)
 */
export function mapDigitalPlatformToFriendly(platform: string | null | undefined): string {
  if (!platform) return 'Digital';
  const key = platform.trim().toLowerCase();
  if (key === 'zelle') return 'Zelle';
  if (key === 'venmo') return 'Venmo';
  if (key === 'apple_cash') return 'AppleCash';
  return toTitleCase(key);
}

/**
 * Wave-1 Item 6: deposit label resolver.
 *
 * Pure threshold function: when the deposit amount equals or exceeds the
 * ticket total (subtotal + tax + tip), the row label flips from "Deposit"
 * to "Paid In Full". Otherwise the row reads "Deposit".
 *
 * Edge cases handled defensively so we never render the wrong label on
 * incomplete data:
 *   - depositCents === 0           → "Deposit" (zero-dollar deposit row;
 *                                     typically not rendered at all, but
 *                                     never label as "Paid In Full")
 *   - totalCents === 0 (unknown)   → "Deposit" (no comparison basis;
 *                                     caller didn't pass the total or the
 *                                     ticket has no subtotal/tax/tip yet)
 *
 * Total convention is fixed by spec: subtotal + tax + tip. Discount is NOT
 * subtracted — callers pass the gross-of-discount total. See
 * ROADMAP-13-ITEMS.md Item 6 for rationale.
 */
export function formatDepositLabel(opts: {
  depositCents: number;
  totalCents: number;
}): string {
  if (
    opts.depositCents > 0 &&
    opts.totalCents > 0 &&
    opts.depositCents >= opts.totalCents
  ) {
    return RECEIPT_VOCAB.PAID_IN_FULL;
  }
  return RECEIPT_VOCAB.DEPOSIT;
}

/**
 * Construct a suggested primary label for a payment line.
 *
 * Deposit-source rows (online_booking_deposit any time, or in_store when
 * first-with-remainder) resolve via formatDepositLabel — yielding either
 * "Deposit" or "Paid In Full" depending on whether the row amount covers
 * the ticket total. All other sources keep their prior labeling:
 *   - online_pay_link → 'Pay Link (Online)'
 *   - method=cash → 'Cash'; check → 'Check'; card → 'Card'
 *   - method=digital → friendly platform name
 *
 * `ticketTotalCents` is the (subtotal + tax + tip) sum in cents. When omitted
 * (default 0), the threshold check never fires and deposits render as
 * "Deposit" — safe for the composer's informational `suggested_*` fields
 * that don't have access to the ticket totals.
 */
export function buildSuggestedPaymentLabel(
  line: RenderedPaymentLine,
  ticketTotalCents: number = 0
): string {
  // Phase 1A.5 Part A: digital payments use the platform name as the primary
  // label. Composer NEVER renders the word "Digital" on a customer-visible
  // receipt — the platform identifier carries all the information.
  // Falls through to 'Digital' generic when digital_platform is missing
  // (defensive — DB CHECK should prevent this state, but render rather
  // than crash on corrupt data).
  if (line.method === 'digital') {
    return mapDigitalPlatformToFriendly(line.digital_platform);
  }
  // Wave-1 Item 6: unified deposit label + paid-in-full threshold.
  // A row is treated as a "deposit" when:
  //   - source is online_booking_deposit (always — booking deposits are
  //     labeled as deposits regardless of whether a remainder exists), OR
  //   - source is in_store AND it's the first payment with a remainder
  //     after it applies (legacy "Deposit (In-Store)" case).
  const isDepositRow =
    line.source === 'online_booking_deposit' ||
    (line.source === 'in_store' && line.is_first_with_remainder);
  if (isDepositRow) {
    return formatDepositLabel({
      depositCents: line.amount_cents,
      totalCents: ticketTotalCents,
    });
  }
  if (line.source === 'online_pay_link') return RECEIPT_VOCAB.PAY_LINK_ONLINE;
  switch (line.method) {
    case 'cash': return 'Cash';
    case 'check': return 'Check';
    case 'card': return 'Card';
    default: return line.method;
  }
}

function buildMethodDetail(line: Pick<RenderedPaymentLine, 'method' | 'card_brand' | 'card_last_four' | 'digital_platform'>): string {
  if (line.method === 'card' && line.card_brand) {
    return `${formatCardBrand(line.card_brand)} ****${line.card_last_four ?? '????'}`;
  }
  switch (line.method) {
    case 'cash': return 'Cash';
    case 'check': return 'Check';
    case 'card': return 'Card';
    case 'split': return 'Split';
    case 'digital':
      // Phase 1A.5: method_detail mirrors the primary label for digital so
      // the buildCombinedPaymentLabel 2-segment path produces "Zelle · date"
      // without a redundant repeat. Combined-label assembly recognizes the
      // method as digital and elides method_detail from the rendered string.
      return mapDigitalPlatformToFriendly(line.digital_platform);
    default: return line.method;
  }
}

/**
 * Phase 1A LOCKED-9: assemble the combined payment-row label per the locked
 * format hierarchy. Returns ONE string composed of 2 or 3 ` · `-joined
 * segments depending on the source:
 *
 *   - Booking deposit          → `Deposit · Amex ****1074 · 5/4/26 9:15 AM`
 *                                (Wave-1 Item 6: was "Deposit (Online)";
 *                                 flips to "Paid In Full · ..." when the
 *                                 deposit covers subtotal+tax+tip)
 *   - In-store deposit (rare)  → `Deposit · Cash · 5/4/26 9:15 AM`
 *                                (Wave-1 Item 6: was "Deposit (In-Store)")
 *   - Pay-link payment         → `Pay Link (Online) · Amex ****1074 · 5/4/26 9:15 AM`
 *   - Regular cash             → `Cash · 5/6/26 10:32 AM`
 *   - Regular card             → `Amex ****1074 · 5/6/26 10:32 AM` (method_detail leads;
 *                                 bare "Card" is redundant when brand+last4 is known)
 *   - Regular check            → `Check · 5/6/26 10:32 AM`
 *
 * 3-segment form is used when the primary label is a META label
 * (Deposit/Paid In Full/Pay Link) distinct from the physical method;
 * otherwise the primary IS the method label and the method_detail segment
 * is omitted (or for cards, replaces the bare 'Card' primary).
 *
 * Timestamp is omitted entirely when `createdAt` is null/missing — produces
 * the leading segment(s) only.
 */
export function buildCombinedPaymentLabel(opts: {
  primary: string;
  methodDetail: string;
  source: PaymentSource;
  method: string;
  createdAt: string | null | undefined;
}): string {
  // Wave-1 Item 6: DEPOSIT and PAID_IN_FULL (replacements for the old
  // DEPOSIT_ONLINE / DEPOSIT_IN_STORE) are still meta-primaries — they're
  // semantic labels distinct from the physical tender, so the renderer
  // produces the 3-segment `primary · method_detail · timestamp` form.
  const isMetaPrimary =
    opts.primary === RECEIPT_VOCAB.DEPOSIT ||
    opts.primary === RECEIPT_VOCAB.PAID_IN_FULL ||
    opts.primary === RECEIPT_VOCAB.PAY_LINK_ONLINE;
  const ts = formatReceiptDateTimeCompact(opts.createdAt);

  // Leading segment(s): for meta-primary labels, primary + method_detail;
  // for card method, method_detail alone (brand+last4 trumps bare "Card");
  // for cash/check/digital, primary alone (primary IS the user-visible label —
  // method_detail would be a redundant repeat).
  let leading: string;
  if (isMetaPrimary) {
    leading = `${opts.primary} · ${opts.methodDetail}`;
  } else if (opts.method === 'card') {
    leading = opts.methodDetail;
  } else {
    // Includes cash, check, digital, split.
    leading = opts.primary;
  }

  return ts ? `${leading} · ${ts}` : leading;
}

// ---------------------------------------------------------------------------
// Renderer-callable label helper (Phase 1A)
// ---------------------------------------------------------------------------

/**
 * Build the combined payment-row label for a payment-row-shaped input
 * without first constructing a full RenderedPaymentLine. Used by renderers
 * that consume `ReceiptPayment` (which lacks composer-derived fields when
 * the payment didn't flow through composeReceiptPaymentLines — e.g.,
 * fixtures in inputs.ts, legacy walk-in paths).
 *
 * Caller supplies `isFirstWithRemainder` because the renderer has access
 * to the chronological position + appointment_total to derive it cheaply.
 *
 * Wave-1 Item 6: `ticketTotalCents` (subtotal + tax + tip, in cents) drives
 * the Deposit / Paid-In-Full threshold inside formatDepositLabel. Defaults
 * to 0 for back-compat — when omitted, deposit rows always render as
 * "Deposit". Renderers that surface the threshold pass the real total.
 */
export function buildSuggestedLabelForPayment(
  p: {
    method: string;
    amount?: number;
    card_brand?: string | null;
    card_last_four?: string | null;
    source_label?: string | null;
    source_notes?: string | null;
    created_at?: string | null;
    digital_platform?: string | null;
  },
  isFirstWithRemainder: boolean,
  ticketTotalCents: number = 0
): string {
  const source: PaymentSource = p.source_notes
    ? detectPaymentSource(p.source_notes)
    : sourceFromLabel(p.source_label);

  // Reuse the same primary/method-detail logic by constructing a partial
  // RenderedPaymentLine shape. amount_cents is populated when the caller
  // passes p.amount so formatDepositLabel can compare against the total.
  const dummy: RenderedPaymentLine = {
    payment_id: '',
    date_short: '',
    date_long: '',
    source,
    is_first_payment: isFirstWithRemainder, // unused by builders below
    is_first_with_remainder: isFirstWithRemainder,
    method: p.method,
    card_brand: p.card_brand ?? null,
    card_last_four: p.card_last_four ?? null,
    amount_cents: toCents(Number(p.amount ?? 0)),
    cash_tendered_cents: null,
    change_given_cents: null,
    tip_amount_cents: 0,
    digital_platform: p.digital_platform ?? null,
    suggested_primary_label: '',
    suggested_method_detail: '',
    suggested_label_combined: '',
  };
  const primary = buildSuggestedPaymentLabel(dummy, ticketTotalCents);
  const methodDetail = buildMethodDetail(dummy);
  return buildCombinedPaymentLabel({
    primary,
    methodDetail,
    source,
    method: p.method,
    createdAt: p.created_at,
  });
}

// ---------------------------------------------------------------------------
// Loyalty footer composer (Phase 1A REVISED LOCKED-7)
// ---------------------------------------------------------------------------

export interface RenderedLoyaltyFooter {
  /** Whether to render the footer at all. False when no loyalty was
   *  redeemed on this transaction. */
  show: boolean;
  /** Points redeemed on this transaction. >= 0. */
  redeemed_pts: number;
  /** Post-transaction loyalty balance snapshot from loyalty_ledger
   *  (latest row for this transaction). NULL when the lookup couldn't
   *  reconstruct a balance (pre-ledger historical rows / data corruption).
   *  Renderers omit the balance line when null. */
  balance_after_pts: number | null;
}

/**
 * Compose the loyalty footer block that renders below Balance Due /
 * Paid in Full when loyalty points were redeemed on this transaction.
 *
 * REVISED LOCKED-7: footer is the ONLY surface where loyalty appears
 * "below the payment line". Loyalty discount itself stays in the
 * discount section above TOTAL (per CDTFA Reg 1671.1 — loyalty
 * redemption reduces the taxable base, it is not a tender).
 */
export function composeLoyaltyFooter(
  loyalty_points_redeemed: number | null | undefined,
  loyalty_balance_after_pts: number | null | undefined
): RenderedLoyaltyFooter {
  const redeemed = Number(loyalty_points_redeemed ?? 0);
  if (redeemed <= 0) {
    return { show: false, redeemed_pts: 0, balance_after_pts: null };
  }
  const balance =
    loyalty_balance_after_pts == null
      ? null
      : Number(loyalty_balance_after_pts);
  return {
    show: true,
    redeemed_pts: redeemed,
    balance_after_pts: balance,
  };
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
      // Phase 1A.5: pass digital_platform through so renderer-side label
      // construction can recover the platform identifier without re-fetching.
      digital_platform: p.digital_platform ?? null,
      // Filled below.
      suggested_primary_label: '',
      suggested_method_detail: '',
      suggested_label_combined: '',
    };

    line.suggested_primary_label = buildSuggestedPaymentLabel(line);
    line.suggested_method_detail = buildMethodDetail(line);
    // Phase 1A LOCKED-9: combined label uses the meta-primary / method-detail
    // hierarchy with compact PST timestamp (LOCKED-6 format M/D/YY h:MM AM/PM).
    line.suggested_label_combined = buildCombinedPaymentLabel({
      primary: line.suggested_primary_label,
      methodDetail: line.suggested_method_detail,
      source: line.source,
      method: line.method,
      createdAt: p.created_at,
    });

    rawLines.push(line);
  }

  const totalPaidCents = runningPaidCents;
  const balanceDueCents = Math.max(0, appointmentTotalCents - totalPaidCents);
  // REVISED LOCKED-3: paid-in-full fires when a real bill existed and the
  // balance is now zero — regardless of whether the bill was zeroed by
  // tender, loyalty redemption, full coupon discount, etc. The earlier
  // condition (`totalPaidCents > 0`) excluded the loyalty-only case where
  // redemption fully discounts the appointment with no tender at all.
  const isPaidInFull = appointment != null && balanceDueCents === 0 && appointmentTotalCents > 0;

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
