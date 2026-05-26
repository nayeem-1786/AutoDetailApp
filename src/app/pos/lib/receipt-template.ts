import type { MergedReceiptConfig, CustomTextZone } from '@/lib/data/receipt-config';
import { formatPhone, formatReceiptDateTime } from '@/lib/utils/format';
import { LOYALTY } from '@/lib/utils/constants';
import QRCode from 'qrcode';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { formatCardBrand } from '@/lib/utils/card-brand';
import type { RefundSource } from '@/lib/data/refund-sources';
import {
  buildSuggestedLabelForPayment,
  composeLoyaltyFooter,
  RECEIPT_VOCAB,
} from '@/lib/data/receipt-composer';
import { toCents } from '@/lib/utils/refund-math';
import { getLineItemPricingInfo } from '@/lib/quotes/line-item-pricing';
import { renderTierToken } from '@/lib/quotes/tier-display';

interface ReceiptItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tax_amount: number;
  item_type?: string | null;
  standard_price?: number | null;
  pricing_type?: string | null;
  prerequisite_note?: string | null;
  tier_name?: string | null;
  /** D46 (Issue 41): operator-curated tier presentation fields attached
   *  by receipt-data.ts mapTransactionRow via attachTierMetaToItems.
   *  Consumed by renderTierToken at the rendering sites. */
  tier_label?: string | null;
  qty_label?: string | null;
}

interface ReceiptRefundItem {
  id: string;
  transaction_item_id: string;
  quantity: number;
  amount: number;
}

interface ReceiptRefund {
  id: string;
  amount: number;
  status: string;
  reason: string | null;
  points_clawed_back: number;
  points_restored: number;
  created_at: string;
  refund_items: ReceiptRefundItem[];
  /** Per-method source-plan breakdown — populated by receipt-data.ts when
   * refunds.notes is a JSON {sources:[...]} payload (Session 4d). Undefined
   * for single-source / pre-Session-4d refunds; renderer skips the
   * "Refunded to:" block when absent. */
  sources?: RefundSource[];
}

interface ReceiptPayment {
  /** DB row id. Universally present at runtime (set by Supabase joined-row
   * spread); declared here to give consumers — public receipt page React
   * key prop, etc. — a typed handle without a cast. Renderers ignore it. */
  id?: string;
  method: string;
  amount: number;
  tip_amount: number;
  card_brand?: string | null;
  card_last_four?: string | null;
  /** Cash-only: what the customer handed over. NULL on historical rows + non-cash. */
  cash_tendered?: number | null;
  /** Cash-only: change handed back. NULL on historical rows + non-cash. */
  change_given?: number | null;
  /** When this payment row was created. Required for online-source date stamps
   * (e.g. "Online (pay link) · May 2, 2026, 5:43 PM"). Optional for back-compat. */
  created_at?: string | null;
  /** Human-readable source label assembled in receipt-data.ts via
   * derivePaymentSourceLabel. Defined for appointment-linked transactions
   * where the renderer iterates the FULL appointment payment history;
   * absent on walk-in transactions where local payments[] is the source. */
  source_label?: string | null;
  /** Phase 1A.5 Part A: canonical digital platform identifier (lowercase)
   * when method='digital'. Composer's mapDigitalPlatformToFriendly converts
   * this to the receipt-visible label (e.g., 'zelle' → 'Zelle', 'cash app'
   * → 'Cash App'). NULL for all non-digital methods (DB CHECK enforced). */
  digital_platform?: string | null;
}

export interface ReceiptTransaction {
  /** Transaction status — used to render VOIDED/REFUNDED banners on receipts */
  status?: string;
  receipt_number: string | null;
  transaction_date: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  coupon_code?: string | null;
  loyalty_discount?: number;
  loyalty_points_redeemed?: number;
  tip_amount: number;
  total_amount: number;
  customer?: {
    first_name: string;
    last_name: string;
    phone?: string | null;
    email?: string | null;
    customer_type?: string | null;
    created_at?: string | null;
  } | null;
  employee?: { first_name: string; last_name: string } | null;
  vehicle?: { vehicle_type?: string | null; year?: number | null; make?: string | null; model?: string | null; color?: string | null } | null;
  items: ReceiptItem[];
  payments: ReceiptPayment[];
  loyalty_points_earned?: number;
  refunds?: ReceiptRefund[];
  /** Deposit receipt fields — set when transaction is linked to an appointment with payment_type='deposit' */
  is_deposit?: boolean;
  deposit_amount?: number;
  balance_due?: number;
  /** Balance payment — deposit_credit > 0 means a prior online deposit was subtracted from this checkout */
  deposit_credit?: number;
  /** ISO date when the deposit was originally collected (for label display) */
  deposit_date?: string;
  /** Cross-reference to the linked deposit or balance receipt */
  linked_receipt?: { receipt_number: string; label: string } | null;
  /** Balance due on the linked appointment (cents). Defined only for
   * appointment-linked transactions — sum of all completed-transaction
   * payments on the appointment vs appointment.total_amount, never negative.
   * Renderers display this as a "Balance Due" row at the end of the Payment
   * section, even at $0.00. Walk-in transactions leave this undefined and
   * the row is skipped. */
  appointment_balance_due?: number;
  /** Appointment gross (dollars). Defined for appointment-linked
   * transactions. Renderers use this as the Total line so close-out
   * receipts (total_amount=0) display the meaningful gross instead of $0. */
  appointment_total?: number;
  /**
   * Phase 1A REVISED LOCKED-7: customer's loyalty point balance AFTER this
   * transaction's redemption+earning settled. Sourced from the LATEST
   * loyalty_ledger row for this transaction (created_at DESC LIMIT 1) so
   * the value is a historical snapshot, not the customer's current balance.
   *
   * NULL when loyalty_points_redeemed=0 (no footer rendered) OR when the
   * ledger lookup found no row (pre-ledger historical transactions / data
   * corruption — footer renders the "redeemed" line only).
   */
  loyalty_balance_after_pts?: number | null;
}

export interface ReceiptLine {
  type: 'header' | 'text' | 'bold' | 'divider' | 'columns' | 'spacer' | 'image' | 'barcode' | 'qr';
  text?: string;
  left?: string;
  center?: string;
  right?: string;
  url?: string;
  width?: number;
  alignment?: 'left' | 'center' | 'right';
  barcodeData?: string;    // Data to encode in barcode
  qrData?: string;         // URL to encode in QR code
  qrLabel?: string;        // Label text below QR code (e.g., "Google Reviews")
}

export interface ReceiptContext {
  googleReviewUrl?: string;
  yelpReviewUrl?: string;
}

export interface ReceiptImages {
  qrGoogle?: string;  // data:image/png;base64,...
  qrYelp?: string;    // data:image/png;base64,...
  barcode?: string;   // data:image/png;base64,... (Code 128 via bwip-js)
  logoBase64?: string; // data:image/{type};base64,... (inline logo for print paths)
}

/**
 * Fetch a logo URL and convert to base64 data URI for inline embedding.
 * Falls back to null on any failure (caller should use original URL).
 */
export async function fetchLogoAsBase64(logoUrl: string): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

// Fallback when no config is passed (callers should always pass DB config)
const FALLBACK_CONFIG: MergedReceiptConfig = {
  name: '',
  phone: '',
  address: '',
  email: null,
  website: null,
  logo_url: null,
  logo_width: 200,
  logo_placement: 'above_name',
  logo_alignment: 'center',
  custom_text: null,
  custom_text_placement: 'below_footer',
  custom_text_zones: [],
};

/**
 * Map vehicle_type enum to a human-readable label.
 */
function getVehicleTypeLabel(vehicleType: string | null | undefined): string {
  switch (vehicleType) {
    case 'motorcycle': return 'Motorcycle';
    case 'rv': return 'RV';
    case 'boat': return 'Boat';
    case 'aircraft': return 'Aircraft';
    case 'standard':
    default: return 'Vehicle';
  }
}


function buildVehicleDesc(v: ReceiptTransaction['vehicle']): string {
  if (!v) return '';
  const typeLabel = getVehicleTypeLabel(v.vehicle_type);
  const details = cleanVehicleDescription({ year: v.year, color: v.color, make: v.make, model: v.model });
  if (!details) return typeLabel;
  return `${typeLabel} | ${details}`;
}

/**
 * Resolve {shortcode} placeholders in text using transaction + config data.
 */
export function resolveShortcodes(
  text: string,
  tx: ReceiptTransaction,
  config: MergedReceiptConfig
): string {
  const customer = tx.customer;

  let customerSince = '';
  if (customer?.created_at) {
    const d = new Date(customer.created_at);
    const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    customerSince = `${month} ${d.getFullYear()}`;
  }

  const vehicleStr = buildVehicleDesc(tx.vehicle);

  const replacements: Record<string, string> = {
    '{customer_name}': customer ? `${customer.first_name} ${customer.last_name}` : '',
    '{customer_first_name}': customer?.first_name || '',
    '{customer_phone}': customer?.phone ? formatPhone(customer.phone) : '',
    '{customer_email}': customer?.email || '',
    '{customer_type}': customer?.customer_type === 'professional' ? 'Professional' : 'Enthusiast',
    '{customer_since}': customerSince,
    '{staff_name}': tx.employee ? `${tx.employee.first_name} ${tx.employee.last_name}` : '',
    '{staff_first_name}': tx.employee?.first_name || '',
    '{receipt_number}': tx.receipt_number || '',
    '{transaction_date}': new Date(tx.transaction_date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }),
    '{total_amount}': `$${tx.total_amount.toFixed(2)}`,
    '{vehicle}': vehicleStr,
    '{business_name}': config.name,
    '{business_phone}': config.phone,
    '{business_email}': config.email || '',
    '{business_address}': config.address,
    '{business_website}': config.website || '',
  };

  let result = text;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, value);
  }
  return result;
}

/**
 * Get enabled zones for a specific placement, with shortcodes resolved.
 */
function getZonesForPlacement(
  config: MergedReceiptConfig,
  tx: ReceiptTransaction,
  placement: CustomTextZone['placement']
): string[] {
  // If custom_text_zones exist, use them
  if (config.custom_text_zones.length > 0) {
    return config.custom_text_zones
      .filter(z => z.enabled && z.placement === placement && z.content.trim())
      .map(z => resolveShortcodes(z.content, tx, config));
  }
  // Fallback to legacy single custom_text
  if (config.custom_text && config.custom_text_placement === placement) {
    return [config.custom_text];
  }
  return [];
}

/** Regex matching any barcode/QR shortcode inline */
const SHORTCODE_RE = /\{barcode_receipt\}|\{qr_google\}|\{qr_yelp\}/g;

/**
 * Push zone text lines, detecting barcode/QR shortcodes inline and converting to typed ReceiptLines.
 * Supports shortcodes mixed with text on the same line (e.g., "Leave a review! {qr_google}").
 */
function pushZoneLines(
  lines: ReceiptLine[],
  zoneText: string,
  tx: ReceiptTransaction,
  reviewUrls: { google?: string; yelp?: string }
) {
  const parts = zoneText.split('\n');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      // Blank line → emit vertical whitespace on the receipt
      lines.push({ type: 'text', text: '' });
      continue;
    }

    // If no shortcodes on this line, emit as plain text
    if (!SHORTCODE_RE.test(trimmed)) {
      lines.push({ type: 'text', text: trimmed });
      continue;
    }

    // Scan for shortcodes, emitting text segments between them
    SHORTCODE_RE.lastIndex = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SHORTCODE_RE.exec(trimmed)) !== null) {
      // Text before this shortcode
      const before = trimmed.slice(lastIndex, match.index).trim();
      if (before) lines.push({ type: 'text', text: before });

      // Emit the shortcode element
      switch (match[0]) {
        case '{barcode_receipt}':
          if (tx.receipt_number) {
            lines.push({ type: 'barcode', barcodeData: tx.receipt_number, alignment: 'center' });
          } else {
            lines.push({ type: 'text', text: '[Receipt Barcode: no receipt number]' });
          }
          break;
        case '{qr_google}':
          if (reviewUrls.google) {
            lines.push({ type: 'qr', qrData: reviewUrls.google, qrLabel: 'Review on Google', alignment: 'center' });
          } else {
            lines.push({ type: 'text', text: '[Google Reviews QR: URL not configured]' });
          }
          break;
        case '{qr_yelp}':
          if (reviewUrls.yelp) {
            lines.push({ type: 'qr', qrData: reviewUrls.yelp, qrLabel: 'Review on Yelp', alignment: 'center' });
          } else {
            lines.push({ type: 'text', text: '[Yelp Reviews QR: URL not configured]' });
          }
          break;
      }
      lastIndex = match.index + match[0].length;
    }

    // Text after the last shortcode
    const after = trimmed.slice(lastIndex).trim();
    if (after) lines.push({ type: 'text', text: after });
  }
}

/**
 * Generate a structured receipt from transaction data.
 * This can be used by Star WebPRNT or formatted as plain text.
 */
// ─── Refund Helpers ─────────────────────────────────────────────────────────

/**
 * Format a refund source's method-side label.
 * - Cash:           "Cash"
 * - Card w/ brand:  "Card (Visa ****8085)"
 * - Card no brand:  "Card"   (close-out source where local payments lookup missed)
 * Used by both thermal and HTML refund renderers.
 */
function formatRefundSourceLabel(source: RefundSource): string {
  if (source.method === 'cash') return 'Cash';
  if (source.method === 'card') {
    const brand = formatCardBrand(source.card_brand);
    if (source.card_last_four) {
      return `Card (${brand} ****${source.card_last_four})`;
    }
    return brand === 'Card' ? 'Card' : `Card (${brand})`;
  }
  // Defensive — non-cash, non-card method label falls back to the raw value
  // title-cased. Engine only writes 'cash' / 'card' today; this branch keeps
  // future tender additions from rendering blank.
  return source.method.charAt(0).toUpperCase() + source.method.slice(1);
}

function buildRefundedMap(refunds: ReceiptRefund[] | undefined): Map<string, { qty: number; amount: number }> {
  const map = new Map<string, { qty: number; amount: number }>();
  for (const refund of refunds ?? []) {
    if (refund.status !== 'processed') continue;
    for (const ri of refund.refund_items) {
      const existing = map.get(ri.transaction_item_id) ?? { qty: 0, amount: 0 };
      existing.qty += ri.quantity;
      existing.amount += ri.amount;
      map.set(ri.transaction_item_id, existing);
    }
  }
  return map;
}

function getRefundStatus(refunds: ReceiptRefund[] | undefined, items: ReceiptItem[]): 'none' | 'partial' | 'full' {
  const processed = (refunds ?? []).filter((r) => r.status === 'processed');
  if (processed.length === 0) return 'none';
  const refundedMap = buildRefundedMap(refunds);
  const allFullyRefunded = items.every((item) => {
    const r = refundedMap.get(item.id);
    return r && r.qty >= item.quantity;
  });
  return allFullyRefunded ? 'full' : 'partial';
}

function formatRefundDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Phase 1A payment-line helpers
// ---------------------------------------------------------------------------

/**
 * Standard thermal width — 48 columns matches the shop's 80mm thermal
 * printer print width (also the default in receiptToPlainText and escpos
 * renderers in this file). Payment-row wrap (LOCKED-10) kicks in only when
 * the combined label + amount overflows this budget.
 */
const THERMAL_WIDTH = 48;

/**
 * Pre-compute is_first_with_remainder per payment row, mirroring the
 * composer's chronological-first + remainder-after-applying logic. Renderer
 * needs this because tx.payments (the consumed shape) doesn't carry the
 * flag — composeReceiptPaymentLines computes it internally; we replicate
 * here so fixtures + legacy walk-ins get the same labels.
 */
function buildFirstWithRemainderFlags(payments: ReceiptPayment[], appointmentTotal: number | undefined): boolean[] {
  if (payments.length === 0) return [];
  const apptTotalCents = appointmentTotal == null ? 0 : toCents(appointmentTotal);
  const flags = new Array<boolean>(payments.length).fill(false);
  // First payment in chronological order. tx.payments is already sorted by
  // receipt-data.ts (created_at ASC); for fixtures, the order in the array
  // IS the chronological order.
  let runningCents = 0;
  for (let i = 0; i < payments.length; i++) {
    const amt = toCents(Number(payments[i].amount ?? 0));
    runningCents += amt;
    if (i === 0) {
      flags[i] = apptTotalCents > 0 && runningCents < apptTotalCents;
    }
  }
  return flags;
}

/**
 * Phase 1A LOCKED-10 (thermal wrap): if the combined label + " " + amount
 * exceeds `width`, split at the LAST " · " segment so line 1 carries
 * primary+method and line 2 carries the indented timestamp. Returns one or
 * two strings.
 */
export function wrapPaymentLabelForThermal(
  combined: string,
  amountStr: string,
  width: number = THERMAL_WIDTH
): string[] {
  // Budget = total width - amount length - 1 space separator
  const budget = width - amountStr.length - 1;
  if (combined.length <= budget) return [combined];
  const lastSep = combined.lastIndexOf(' · ');
  if (lastSep === -1) return [combined]; // no separator → caller's text-wrap takes over
  return [
    combined.substring(0, lastSep),
    '  ' + combined.substring(lastSep + 3),
  ];
}

// ---------------------------------------------------------------------------

export function generateReceiptLines(tx: ReceiptTransaction, config?: MergedReceiptConfig, context?: ReceiptContext): ReceiptLine[] {
  const c = config ?? FALLBACK_CONFIG;
  const lines: ReceiptLine[] = [];
  const reviewUrls = { google: context?.googleReviewUrl, yelp: context?.yelpReviewUrl };

  // Logo above name
  if (c.logo_url && c.logo_placement === 'above_name') {
    lines.push({ type: 'image', url: c.logo_url, width: c.logo_width, alignment: c.logo_alignment });
  }

  // Header
  lines.push({ type: 'header', text: c.name });

  // Logo below name
  if (c.logo_url && c.logo_placement === 'below_name') {
    lines.push({ type: 'image', url: c.logo_url, width: c.logo_width, alignment: c.logo_alignment });
  }

  lines.push({ type: 'text', text: c.address });
  lines.push({ type: 'text', text: c.phone });
  if (c.email) lines.push({ type: 'text', text: c.email });
  if (c.website) lines.push({ type: 'text', text: c.website });

  lines.push({ type: 'divider' });

  // Custom text zones: below_header
  const belowHeaderZones = getZonesForPlacement(c, tx, 'below_header');
  for (let i = 0; i < belowHeaderZones.length; i++) {
    if (i > 0) lines.push({ type: 'divider' });
    pushZoneLines(lines, belowHeaderZones[i], tx, reviewUrls);
  }
  if (belowHeaderZones.length > 0) {
    lines.push({ type: 'divider' });
  }

  // Voided transaction banner — uses 'header' type for double-height on thermal printers
  const isVoided = tx.status === 'voided';
  if (isVoided) {
    lines.push({ type: 'header', text: '*** VOIDED ***' });
    lines.push({ type: 'divider' });
  }

  // Refund status + refunded map
  const refundStatus = getRefundStatus(tx.refunds, tx.items);
  const refundedMap = buildRefundedMap(tx.refunds);

  // Phase 1A LOCKED-5: BOOKING DEPOSIT banner retired. Running deposit
  // receipts now render with standard partial-payment format — deposit
  // chrome (banner, "TOTAL CHARGED", "EST. BALANCE DUE", "Final balance"
  // note) deleted. The is_deposit flag remains on ReceiptTransaction for
  // data fidelity but the renderer no longer reads it.

  // Receipt number & date with time
  lines.push({
    type: 'columns',
    left: `Receipt #${tx.receipt_number || 'N/A'}`,
    right: formatReceiptDateTime(tx.transaction_date),
  });

  if (refundStatus !== 'none') {
    lines.push({
      type: 'text',
      text: refundStatus === 'full' ? '** REFUNDED **' : '** PARTIALLY REFUNDED **',
      alignment: 'center',
    });
  }

  // Customer name + type, phone
  if (tx.customer) {
    const typeLabel = tx.customer.customer_type === 'professional' ? 'Professional' : 'Enthusiast';
    lines.push({
      type: 'columns',
      left: `${tx.customer.first_name} ${tx.customer.last_name}, ${typeLabel}`,
      right: tx.customer.phone ? formatPhone(tx.customer.phone) : '',
    });
  }

  // Email + Customer Since
  if (tx.customer && (tx.customer.email || tx.customer.created_at)) {
    let sinceStr = '';
    if (tx.customer.created_at) {
      const d = new Date(tx.customer.created_at);
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      sinceStr = `Customer Since: ${month} ${d.getFullYear()}`;
    }
    lines.push({
      type: 'columns',
      left: tx.customer.email || '',
      right: sinceStr,
    });
  }

  // Vehicle description — one line under customer info
  const vehicleDesc = buildVehicleDesc(tx.vehicle);
  if (vehicleDesc) {
    lines.push({
      type: 'columns',
      left: vehicleDesc,
      right: '',
    });
  }

  lines.push({ type: 'divider' });

  // Items layout:
  //   qty > 1: line 1 = item name (full width, wraps if long)
  //            line 2 = indented qty + price + TX
  //   qty = 1: single line = name + price + TX
  //   Services get an indented vehicle description line below
  for (const item of tx.items) {
    const price = `$${item.total_price.toFixed(2)}`;
    const txCol = item.tax_amount > 0 ? ' TX' : '   ';
    // D46 (Issue 41): unified tier token via renderTierToken — replaces
    // raw tier_name slug rendering with the operator-curated tier_label
    // (or pluralized qty_label for qty>1). Wrapper format (`name - tier`)
    // preserved; 32-char wrap handled by existing wrapTextToWidth logic.
    const tierToken = renderTierToken({
      tier_name: item.tier_name ?? null,
      tier_label: item.tier_label,
      qty_label: item.qty_label,
      quantity: item.quantity,
    });
    const displayName = tierToken
      ? `${item.item_name} - ${tierToken}`
      : item.item_name;
    if (item.quantity > 1) {
      lines.push({ type: 'columns', left: displayName, right: '' });
      lines.push({
        type: 'columns',
        left: `  ${item.quantity} x $${item.unit_price.toFixed(2)} each`,
        right: `${price}${txCol}`,
      });
    } else {
      lines.push({
        type: 'columns',
        left: displayName,
        right: `${price}${txCol}`,
      });
    }

    // Sale/combo savings sub-text — shared formatter (Issue 33 follow-up UX).
    const pricingInfoText = getLineItemPricingInfo({
      unit_price: item.unit_price,
      standard_price: item.standard_price ?? null,
      pricing_type:
        (item.pricing_type as 'standard' | 'sale' | 'combo' | null) ?? null,
      quantity: item.quantity,
    });
    if (pricingInfoText.hasDiscount) {
      lines.push({
        type: 'text',
        text: `  ${pricingInfoText.label}: Reg $${(pricingInfoText.standardPrice as number).toFixed(2)} | Saved $${pricingInfoText.savingsPerUnit.toFixed(2)}!`,
      });
    }

    // Prerequisite note sub-text
    if (item.prerequisite_note) {
      lines.push({
        type: 'text',
        text: `  ${item.prerequisite_note}`,
      });
    }

    // Refund indicator for this item
    const refunded = refundedMap.get(item.id);
    if (refunded) {
      lines.push({
        type: 'text',
        text: `  >> REFUNDED (${refunded.qty}) -$${refunded.amount.toFixed(2)}`,
      });
    }
  }

  lines.push({ type: 'divider' });

  // Totals
  lines.push({
    type: 'columns',
    left: 'Subtotal',
    right: `$${tx.subtotal.toFixed(2)}`,
  });

  lines.push({
    type: 'columns',
    left: 'Tax',
    right: `$${tx.tax_amount.toFixed(2)}`,
  });

  const nonLoyaltyDiscount = tx.discount_amount - (tx.loyalty_discount || 0);
  if (nonLoyaltyDiscount > 0) {
    const discountLabel = tx.coupon_code ? `Coupon (${tx.coupon_code})` : 'Discount';
    lines.push({
      type: 'columns',
      left: discountLabel,
      right: `-$${nonLoyaltyDiscount.toFixed(2)}`,
    });
  }

  if (tx.loyalty_discount && tx.loyalty_discount > 0) {
    // REVISED LOCKED-7: label change "Loyalty (N pts)" → "Loyalty Discount (N pts)".
    // Loyalty stays in the discount section (above TOTAL) per CDTFA Reg 1671.1
    // — redemption reduces taxable base, not a tender.
    const ptsLabel = tx.loyalty_points_redeemed ? ` (${tx.loyalty_points_redeemed} pts)` : '';
    lines.push({
      type: 'columns',
      left: `${RECEIPT_VOCAB.LOYALTY_LABEL}${ptsLabel}`,
      right: `-$${tx.loyalty_discount.toFixed(2)}`,
    });
  }

  if (tx.tip_amount > 0) {
    lines.push({
      type: 'columns',
      left: 'Tip',
      right: `$${tx.tip_amount.toFixed(2)}`,
    });
  }

  // Phase 1A LOCKED-5: deposit chrome retired. No more deposit-only branch
  // with "TOTAL CHARGED" + "EST. BALANCE DUE AT SERVICE" + "Final balance may
  // include additional services". No more deposit_credit subtotal line —
  // deposits now appear as payment rows in the unified Payments block.
  lines.push({
    type: 'bold',
    text: '',
  });
  // Use the larger of appointment_total and transaction.total_amount.
  // Handles both close-out shells (transaction is $0, appointment carries
  // gross) AND in-store sales that exceed appointment value (transaction
  // carries gross, appointment is stale).
  const grandTotal = Math.max(tx.appointment_total ?? 0, tx.total_amount ?? 0) + tx.tip_amount;
  lines.push({
    type: 'columns',
    left: 'TOTAL',
    right: `$${grandTotal.toFixed(2)}`,
  });

  // Linked receipt cross-reference
  if (tx.linked_receipt) {
    lines.push({
      type: 'text',
      text: `See also: ${tx.linked_receipt.label} #${tx.linked_receipt.receipt_number}`,
      alignment: 'center',
    });
  }

  // Voided indicator after totals — double-height on thermal printers
  if (isVoided) {
    lines.push({ type: 'header', text: '*** VOIDED ***' });
  }

  lines.push({ type: 'divider' });

  // Phase 1A LOCKED-9 + LOCKED-6 + LOCKED-10: payment rows use the unified
  // composer label format ("Deposit · Amex ****1074 · 5/4/26 9:15 AM") with
  // thermal-width wrap to a second indented line when overflow occurs.
  // Wave-1 Item 6: ticketTotalCents (subtotal + tax + tip) drives the
  // Deposit / Paid-In-Full threshold inside buildSuggestedLabelForPayment.
  const firstWithRemainderFlags = buildFirstWithRemainderFlags(tx.payments, tx.appointment_total);
  const ticketTotalCents =
    toCents(Number(tx.subtotal ?? 0)) +
    toCents(Number(tx.tax_amount ?? 0)) +
    toCents(Number(tx.tip_amount ?? 0));
  let totalPaidCents = 0;
  for (let i = 0; i < tx.payments.length; i++) {
    const p = tx.payments[i];
    totalPaidCents += toCents(Number(p.amount ?? 0));
    const combined = buildSuggestedLabelForPayment(
      {
        method: p.method,
        amount: p.amount,
        card_brand: p.card_brand,
        card_last_four: p.card_last_four,
        source_label: p.source_label,
        created_at: p.created_at,
        digital_platform: p.digital_platform,
      },
      firstWithRemainderFlags[i],
      ticketTotalCents
    );
    const amountStr = `$${p.amount.toFixed(2)}`;
    const wrapped = wrapPaymentLabelForThermal(combined, amountStr);
    lines.push({
      type: 'columns',
      left: wrapped[0],
      right: amountStr,
    });
    if (wrapped.length > 1) {
      // Indented continuation line (timestamp on its own row).
      lines.push({ type: 'text', text: wrapped[1] });
    }
    // Cash-only Tendered + Change sub-rows. Two-space indent matches the
    // muted treatment used in generateReceiptHtml + the public receipt page.
    if (p.method === 'cash' && p.cash_tendered != null) {
      lines.push({
        type: 'columns',
        left: '  Tendered',
        right: `$${p.cash_tendered.toFixed(2)}`,
      });
      const change =
        p.change_given != null
          ? p.change_given
          : Math.max(0, p.cash_tendered - p.amount);
      lines.push({
        type: 'columns',
        left: '  Change',
        right: `$${change.toFixed(2)}`,
      });
    }
  }

  // Phase 1A LOCKED-2: Total Paid row, between payments and Balance Due.
  // Only rendered when at least one payment exists. Walk-in single-cash
  // receipts get this row too (total_paid == total) — staff parity worth
  // the extra line.
  if (tx.payments.length > 0) {
    lines.push({
      type: 'columns',
      left: RECEIPT_VOCAB.TOTAL_PAID,
      right: `$${(totalPaidCents / 100).toFixed(2)}`,
    });
  }

  // Phase 1A-followup FIX 2: legacy walk-in fallback for Balance Due / Paid
  // in Full. Pre-Phase-0a transactions have no appointment_balance_due
  // (no appointment to aggregate against) but DO have a non-zero
  // total_amount and a payments[] that may cover it. Compute a fallback
  // balance from transaction-level totals when the appointment-aggregated
  // value is missing.
  const appointmentTotalCents = toCents(Number(tx.appointment_total ?? 0));
  const transactionTotalCents = toCents(Number(tx.total_amount ?? 0));
  const fallbackBalanceCents = Math.max(0, transactionTotalCents - totalPaidCents);
  const balanceCents = tx.appointment_balance_due !== undefined
    ? tx.appointment_balance_due
    : (tx.payments.length > 0 && transactionTotalCents > 0 ? fallbackBalanceCents : undefined);
  const billingTotalCents = Math.max(appointmentTotalCents, transactionTotalCents);

  if (balanceCents !== undefined) {
    // Paid in Full ✓ when balance is zero AND there was a real bill AND
    // the transaction is not voided/refunded (those carry their own banners
    // and "Paid in Full" would be a confusing claim on top of REFUNDED).
    const isPaidInFullStatus = tx.status !== 'voided' && tx.status !== 'refunded' && tx.status !== 'partial_refund';
    if (balanceCents === 0 && billingTotalCents > 0 && isPaidInFullStatus) {
      lines.push({
        type: 'text',
        text: RECEIPT_VOCAB.PAID_IN_FULL_INDICATOR,
        alignment: 'center',
      });
    } else {
      lines.push({
        type: 'columns',
        left: RECEIPT_VOCAB.BALANCE_DUE,
        right: `$${(balanceCents / 100).toFixed(2)}`,
      });
    }
  }

  // Phase 1A REVISED LOCKED-7: loyalty footer block below Balance Due /
  // Paid in Full. Separated by a thin divider, renders below the payments
  // section ONLY when points were redeemed on this transaction.
  const loyaltyFooter = composeLoyaltyFooter(tx.loyalty_points_redeemed, tx.loyalty_balance_after_pts);
  if (loyaltyFooter.show) {
    lines.push({ type: 'divider' });
    lines.push({
      type: 'text',
      text: `${RECEIPT_VOCAB.LOYALTY_REDEEMED_PREFIX} ${loyaltyFooter.redeemed_pts} pts`,
      alignment: 'center',
    });
    if (loyaltyFooter.balance_after_pts != null) {
      lines.push({
        type: 'text',
        text: `${RECEIPT_VOCAB.LOYALTY_BALANCE_PREFIX} ${loyaltyFooter.balance_after_pts} ${RECEIPT_VOCAB.LOYALTY_BALANCE_SUFFIX}`,
        alignment: 'center',
      });
    }
  }

  // Refund summary sections
  const processedRefunds = (tx.refunds ?? []).filter((r) => r.status === 'processed');
  if (processedRefunds.length > 0) {
    lines.push({ type: 'divider' });
    for (const refund of processedRefunds) {
      lines.push({ type: 'text', text: '--- Refund ---', alignment: 'center' });
      lines.push({
        type: 'columns',
        left: 'Refund Date',
        right: formatRefundDate(refund.created_at),
      });
      if (refund.reason) {
        lines.push({ type: 'text', text: `Reason: ${refund.reason}` });
      }
      lines.push({
        type: 'columns',
        left: 'Refund Amount',
        right: `-$${refund.amount.toFixed(2)}`,
      });
      // Per-method breakdown ("Refunded to:") — printed only when the engine
      // wrote a multi-source breakdown into refunds.notes (split tender or
      // close-out). Stripe refund id is intentionally omitted on thermal —
      // monospace surface, paper-saving; staff use POS transaction-detail
      // for reconciliation.
      if (refund.sources && refund.sources.length > 0) {
        lines.push({ type: 'text', text: 'Refunded to:' });
        for (const source of refund.sources) {
          lines.push({
            type: 'columns',
            left: `  ${formatRefundSourceLabel(source)}`,
            right: `-$${Number(source.amount).toFixed(2)}`,
          });
        }
      }
      if (refund.points_clawed_back > 0) {
        lines.push({
          type: 'columns',
          left: 'Points Reversed',
          right: `-${refund.points_clawed_back}`,
        });
      }
      if (refund.points_restored > 0) {
        lines.push({
          type: 'columns',
          left: 'Points Restored',
          right: `+${refund.points_restored}`,
        });
      }
    }
  }

  // Points earned line
  if (tx.customer && (tx.loyalty_points_earned ?? 0) > 0) {
    const dollarValue = (tx.loyalty_points_earned! * LOYALTY.REDEEM_RATE).toFixed(2);
    lines.push({ type: 'divider' });
    lines.push({
      type: 'text',
      text: `Points Earned Today: ${tx.loyalty_points_earned} ($${dollarValue} loyalty cash)`,
      alignment: 'center',
    });
  } else if (!tx.customer) {
    const hypotheticalPoints = Math.floor(tx.subtotal * LOYALTY.EARN_RATE);
    if (hypotheticalPoints > 0) {
      const dollarValue = (hypotheticalPoints * LOYALTY.REDEEM_RATE).toFixed(2);
      lines.push({ type: 'divider' });
      lines.push({
        type: 'text',
        text: `Join our rewards program - this visit would've earned you $${dollarValue} off!`,
        alignment: 'center',
      });
    }
  }

  // Logo above footer
  if (c.logo_url && c.logo_placement === 'above_footer') {
    lines.push({ type: 'spacer' });
    lines.push({ type: 'image', url: c.logo_url, width: c.logo_width, alignment: c.logo_alignment });
  }

  // Custom text zones: above_footer
  const aboveFooterZones = getZonesForPlacement(c, tx, 'above_footer');
  for (let i = 0; i < aboveFooterZones.length; i++) {
    if (i === 0) lines.push({ type: 'spacer' });
    else lines.push({ type: 'divider' });
    pushZoneLines(lines, aboveFooterZones[i], tx, reviewUrls);
  }

  // Custom text zones: below_footer
  const belowFooterZones = getZonesForPlacement(c, tx, 'below_footer');
  if (belowFooterZones.length > 0) {
    lines.push({ type: 'spacer' });
    for (let i = 0; i < belowFooterZones.length; i++) {
      if (i > 0) lines.push({ type: 'divider' });
      pushZoneLines(lines, belowFooterZones[i], tx, reviewUrls);
    }
  }

  lines.push({ type: 'spacer' });

  return lines;
}

/**
 * Convert receipt lines to plain text for display or fallback.
 * Image lines are skipped in plain text output.
 */
export function receiptToPlainText(
  lines: ReceiptLine[],
  width = 48
): string {
  const output: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    switch (line.type) {
      case 'header':
        output.push(centerText(line.text ?? '', width));
        break;
      case 'text':
        output.push(centerText(line.text ?? '', width));
        break;
      case 'bold':
        output.push(line.text ?? '');
        break;
      case 'divider':
        output.push('-'.repeat(width));
        break;
      case 'columns': {
        const left = line.left ?? '';
        const center = line.center ?? '';
        const right = line.right ?? '';
        if (center) {
          const usedLen = left.length + center.length + right.length;
          const totalGap = Math.max(2, width - usedLen);
          const gapLeft = Math.ceil(totalGap / 2);
          const gapRight = totalGap - gapLeft;
          output.push(left + ' '.repeat(gapLeft) + center + ' '.repeat(gapRight) + right);
        } else {
          const gap = width - left.length - right.length;
          output.push(left + ' '.repeat(Math.max(1, gap)) + right);
        }
        break;
      }
      case 'spacer':
        output.push('');
        break;
      case 'image':
        output.push('');
        break;
      case 'barcode':
        output.push(line.barcodeData ? centerText(`[${line.barcodeData}]`, width) : '');
        break;
      case 'qr': {
        if (!line.qrData) { output.push(''); break; }
        // Side-by-side if next line is also QR
        const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
        if (nextLine?.type === 'qr' && nextLine?.qrData) {
          const half = Math.floor(width / 2);
          const label1 = line.qrLabel || 'QR';
          const label2 = nextLine.qrLabel || 'QR';
          output.push(centerText(label1, half) + centerText(label2, half));
          output.push(centerText(line.qrData.substring(0, half - 2), half) + centerText(nextLine.qrData.substring(0, half - 2), half));
          i++; // skip next
        } else {
          const label = line.qrLabel ? `${line.qrLabel}: ` : '';
          output.push(centerText(`${label}${line.qrData}`, width));
        }
        break;
      }
      default:
        output.push('');
        break;
    }
  }

  return output.join('\n');
}

function centerText(text: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Generate a branded HTML receipt from transaction data.
 * Uses all inline styles for email client compatibility.
 * Also used for browser print preview and dialog preview.
 */
export function generateReceiptHtml(tx: ReceiptTransaction, config?: MergedReceiptConfig, images?: ReceiptImages): string {
  const c = config ?? FALLBACK_CONFIG;
  const date = formatReceiptDateTime(tx.transaction_date);

  // Void status
  const htmlIsVoided = tx.status === 'voided';

  // Refund data
  const htmlRefundStatus = getRefundStatus(tx.refunds, tx.items);
  const htmlRefundedMap = buildRefundedMap(tx.refunds);

  // Build vehicle description for customer info section
  const vehicleDesc = buildVehicleDesc(tx.vehicle);

  const itemRows = tx.items
    .map((item) => {
      const txCell = item.tax_amount > 0 ? 'TX' : '';
      // D46 (Issue 41): same renderTierToken adoption as thermal path
      // above. HTML wrapper (`esc(name) - esc(tier)`) preserved; tier
      // labels are operator-managed ASCII so esc() is still applied
      // defensively for any future Unicode entries.
      const tierToken = renderTierToken({
        tier_name: item.tier_name ?? null,
        tier_label: item.tier_label,
        qty_label: item.qty_label,
        quantity: item.quantity,
      });
      const htmlDisplayName = tierToken
        ? `${esc(item.item_name)} - ${esc(tierToken)}`
        : esc(item.item_name);
      let rows = '';
      if (item.quantity > 1) {
        rows += `<tr>
          <td colspan="3" style="padding:4px 0 0;font-size:14px;">${htmlDisplayName}</td>
        </tr>
        <tr>
          <td style="padding:0 0 4px 12px;font-size:13px;color:#444;">${item.quantity} x $${item.unit_price.toFixed(2)} each</td>
          <td style="padding:0 0 4px;font-size:14px;text-align:right;white-space:nowrap;">$${item.total_price.toFixed(2)}</td>
          <td style="padding:0 0 4px 8px;font-size:11px;color:#555;white-space:nowrap;width:20px;">${txCell}</td>
        </tr>`;
      } else {
        rows += `<tr>
        <td style="padding:4px 0;font-size:14px;">${htmlDisplayName}</td>
        <td style="padding:4px 0;font-size:14px;text-align:right;white-space:nowrap;">$${item.total_price.toFixed(2)}</td>
        <td style="padding:4px 0 4px 8px;font-size:11px;color:#555;white-space:nowrap;width:20px;">${txCell}</td>
      </tr>`;
      }

      // Sale/combo savings sub-text — shared formatter (Issue 33 follow-up UX).
      const pricingInfoHtml = getLineItemPricingInfo({
        unit_price: item.unit_price,
        standard_price: item.standard_price ?? null,
        pricing_type:
          (item.pricing_type as 'standard' | 'sale' | 'combo' | null) ?? null,
        quantity: item.quantity,
      });
      if (pricingInfoHtml.hasDiscount) {
        rows += `<tr>
          <td colspan="3" style="padding:0 0 4px 12px;font-size:11px;color:#16a34a;">${pricingInfoHtml.label}: Reg $${(pricingInfoHtml.standardPrice as number).toFixed(2)} | Saved $${pricingInfoHtml.savingsPerUnit.toFixed(2)}!</td>
        </tr>`;
      }

      // Prerequisite note sub-text
      if (item.prerequisite_note) {
        rows += `<tr>
          <td colspan="3" style="padding:0 0 4px 12px;font-size:11px;color:#3b82f6;">${esc(item.prerequisite_note)}</td>
        </tr>`;
      }

      // Refund indicator
      const itemRefund = htmlRefundedMap.get(item.id);
      if (itemRefund) {
        const isFullItem = itemRefund.qty >= item.quantity;
        const nameStyle = isFullItem ? 'text-decoration:line-through;color:#999;' : '';
        // Re-style the item name with strikethrough for fully refunded items
        if (isFullItem && item.quantity > 1) {
          // Replace the first row's item name with strikethrough
          rows = rows.replace(
            `>${esc(item.item_name)}<`,
            ` style="${nameStyle}">${esc(item.item_name)}<`
          );
        } else if (isFullItem) {
          rows = rows.replace(
            `font-size:14px;">${esc(item.item_name)}<`,
            `font-size:14px;${nameStyle}">${esc(item.item_name)}<`
          );
        }
        rows += `<tr>
          <td colspan="3" style="padding:0 0 4px 12px;font-size:11px;color:#dc2626;">REFUNDED (${itemRefund.qty}) -$${itemRefund.amount.toFixed(2)}</td>
        </tr>`;
      }

      return rows;
    })
    .join('');

  const totals: string[] = [];
  totals.push(row('Subtotal', `$${tx.subtotal.toFixed(2)}`));
  totals.push(row('Tax', `$${tx.tax_amount.toFixed(2)}`));
  const htmlNonLoyaltyDiscount = tx.discount_amount - (tx.loyalty_discount || 0);
  if (htmlNonLoyaltyDiscount > 0) {
    const discountLabel = tx.coupon_code ? `Coupon (${tx.coupon_code})` : 'Discount';
    totals.push(row(discountLabel, `-$${htmlNonLoyaltyDiscount.toFixed(2)}`, '#16a34a'));
  }
  if (tx.loyalty_discount && tx.loyalty_discount > 0) {
    // REVISED LOCKED-7: label "Loyalty Discount (N pts)". Stays in the
    // discount section (above TOTAL) per CDTFA Reg 1671.1.
    const ptsLabel = tx.loyalty_points_redeemed ? ` (${tx.loyalty_points_redeemed} pts)` : '';
    totals.push(row(`${RECEIPT_VOCAB.LOYALTY_LABEL}${ptsLabel}`, `-$${tx.loyalty_discount.toFixed(2)}`, '#d97706'));
  }
  if (tx.tip_amount > 0) totals.push(row('Tip', `$${tx.tip_amount.toFixed(2)}`));
  // Phase 1A LOCKED-5: deposit chrome retired. The two "Deposit Paid - Online"
  // subtotal-section rows (is_deposit branch + deposit_credit branch) are
  // deleted. Deposits now appear as payment rows in the unified Payments block.

  const htmlFirstWithRemainderFlags = buildFirstWithRemainderFlags(tx.payments, tx.appointment_total);
  // Wave-1 Item 6: ticketTotalCents (subtotal + tax + tip) drives Deposit /
  // Paid-In-Full threshold. Computed once per receipt and passed to every
  // payment row's label builder.
  const htmlTicketTotalCents =
    toCents(Number(tx.subtotal ?? 0)) +
    toCents(Number(tx.tax_amount ?? 0)) +
    toCents(Number(tx.tip_amount ?? 0));
  let htmlTotalPaidCents = 0;
  const paymentRows = (() => {
    let html = tx.payments
      .map((p, i) => {
        htmlTotalPaidCents += toCents(Number(p.amount ?? 0));
        // Phase 1A LOCKED-9 + LOCKED-6: unified composer label format.
        // No thermal-width wrap on HTML (HTML has no width constraint).
        const combined = buildSuggestedLabelForPayment(
          {
            method: p.method,
            amount: p.amount,
            card_brand: p.card_brand,
            card_last_four: p.card_last_four,
            source_label: p.source_label,
            created_at: p.created_at,
            digital_platform: p.digital_platform,
          },
          htmlFirstWithRemainderFlags[i],
          htmlTicketTotalCents
        );
        let row_html = row(esc(combined), `$${p.amount.toFixed(2)}`);
        // Cash-only: render Tendered + Change as indented sub-rows.
        if (p.method === 'cash' && p.cash_tendered != null) {
          row_html += row('&nbsp;&nbsp;Tendered', `$${p.cash_tendered.toFixed(2)}`, '#666666');
          const change = p.change_given != null ? p.change_given : Math.max(0, p.cash_tendered - p.amount);
          row_html += row('&nbsp;&nbsp;Change', `$${change.toFixed(2)}`, '#666666');
        }
        return row_html;
      })
      .join('');

    // Phase 1A LOCKED-2: Total Paid row, between payments and Balance Due.
    if (tx.payments.length > 0) {
      html += row(RECEIPT_VOCAB.TOTAL_PAID, `$${(htmlTotalPaidCents / 100).toFixed(2)}`);
    }

    // Phase 1A-followup FIX 2: legacy walk-in fallback for Balance Due / Paid
    // in Full. Same logic as the thermal renderer — falls back to
    // transaction-level totals when appointment_balance_due is undefined.
    const htmlAppointmentTotalCents = toCents(Number(tx.appointment_total ?? 0));
    const htmlTransactionTotalCents = toCents(Number(tx.total_amount ?? 0));
    const htmlFallbackBalanceCents = Math.max(0, htmlTransactionTotalCents - htmlTotalPaidCents);
    const htmlBalanceCents = tx.appointment_balance_due !== undefined
      ? tx.appointment_balance_due
      : (tx.payments.length > 0 && htmlTransactionTotalCents > 0 ? htmlFallbackBalanceCents : undefined);
    const htmlBillingTotalCents = Math.max(htmlAppointmentTotalCents, htmlTransactionTotalCents);
    if (htmlBalanceCents !== undefined) {
      const htmlIsPaidInFullStatus = tx.status !== 'voided' && tx.status !== 'refunded' && tx.status !== 'partial_refund';
      if (htmlBalanceCents === 0 && htmlBillingTotalCents > 0 && htmlIsPaidInFullStatus) {
        html += `<tr><td colspan="2" style="padding:6px 0;font-size:14px;font-weight:bold;text-align:center;color:#16a34a;">${RECEIPT_VOCAB.PAID_IN_FULL_INDICATOR}</td></tr>`;
      } else {
        html += row(RECEIPT_VOCAB.BALANCE_DUE, `$${(htmlBalanceCents / 100).toFixed(2)}`);
      }
    }

    // Phase 1A REVISED LOCKED-7: loyalty footer below Balance Due / Paid in Full.
    const htmlLoyaltyFooter = composeLoyaltyFooter(tx.loyalty_points_redeemed, tx.loyalty_balance_after_pts);
    if (htmlLoyaltyFooter.show) {
      html += `<tr><td colspan="2" style="padding:6px 0;"><hr style="border:none;border-top:1px dashed #ccc;margin:0;"></td></tr>`;
      html += `<tr><td colspan="2" style="padding:2px 0;font-size:12px;color:#555;text-align:center;">${RECEIPT_VOCAB.LOYALTY_REDEEMED_PREFIX} ${htmlLoyaltyFooter.redeemed_pts} pts</td></tr>`;
      if (htmlLoyaltyFooter.balance_after_pts != null) {
        html += `<tr><td colspan="2" style="padding:2px 0;font-size:12px;color:#555;text-align:center;">${RECEIPT_VOCAB.LOYALTY_BALANCE_PREFIX} ${htmlLoyaltyFooter.balance_after_pts} ${RECEIPT_VOCAB.LOYALTY_BALANCE_SUFFIX}</td></tr>`;
      }
    }

    return html;
  })();

  const logoAlign = c.logo_alignment || 'center';
  const logoSrc = images?.logoBase64 || c.logo_url;
  const logoHtml = logoSrc
    ? `<div style="text-align:${logoAlign};margin:8px 0;"><img src="${esc(logoSrc)}" alt="" style="display:inline-block;width:${c.logo_width}px;max-width:100%;height:auto;" /></div>`
    : '';

  const linkStyle = 'color:#444444;text-decoration:none;';
  const emailLine = c.email ? `<div style="font-size:13px;"><a href="mailto:${esc(c.email)}" style="${linkStyle}">${esc(c.email)}</a></div>` : '';
  const websiteLine = c.website ? `<div style="font-size:13px;"><a href="${esc(c.website)}" style="${linkStyle}">${esc(c.website)}</a></div>` : '';

  // Build zone HTML for each placement
  const zoneDivider = '<hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">';
  const shortcodeNote = (msg: string) =>
    `<div style="text-align:center;margin:8px 0;padding:6px;border:1px dashed #ccc;color:#999;font-size:11px;">${esc(msg)}</div>`;

  // Returns { type, html } so zoneDiv can batch consecutive QR elements side-by-side
  type ZoneElement = { type: 'qr' | 'other'; html: string };

  const renderShortcodeElement = (code: string): ZoneElement => {
    switch (code) {
      case '{barcode_receipt}':
        if (!tx.receipt_number) {
          return { type: 'other', html: shortcodeNote('[Receipt Barcode: no receipt number]') };
        }
        return {
          type: 'other',
          html: images?.barcode
            ? `<div style="text-align:center;margin:12px 0;">
                <img src="${images.barcode}" alt="Receipt ${esc(tx.receipt_number)}" style="height:40px;" />
                <div style="font-family:monospace;font-size:12px;letter-spacing:1px;margin-top:2px;">${esc(tx.receipt_number)}</div>
              </div>`
            : `<div style="text-align:center;margin:12px 0;">
                <div style="font-family:monospace;font-size:16px;letter-spacing:2px;">${esc(tx.receipt_number)}</div>
                <div style="font-size:11px;color:#666;">Scan barcode on printed receipt</div>
              </div>`,
        };
      case '{qr_google}':
        return images?.qrGoogle
          ? {
              type: 'qr',
              html: `<div style="text-align:center;">
                <div style="font-size:12px;font-weight:bold;margin-bottom:4px;">Review on Google</div>
                <img src="${images.qrGoogle}" alt="Review on Google QR" style="width:120px;height:120px;" />
              </div>`,
            }
          : { type: 'other', html: shortcodeNote('[Google Reviews QR: URL not configured]') };
      case '{qr_yelp}':
        return images?.qrYelp
          ? {
              type: 'qr',
              html: `<div style="text-align:center;">
                <div style="font-size:12px;font-weight:bold;margin-bottom:4px;">Review on Yelp</div>
                <img src="${images.qrYelp}" alt="Review on Yelp QR" style="width:120px;height:120px;" />
              </div>`,
            }
          : { type: 'other', html: shortcodeNote('[Yelp Reviews QR: URL not configured]') };
      default:
        return { type: 'other', html: '' };
    }
  };

  const zoneDiv = (t: string): string => {
    const zoneLines = t.split('\n');
    // Collect all elements with type info for batching consecutive QRs
    const elements: ZoneElement[] = [];

    for (const line of zoneLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // No shortcodes on this line — plain text
      if (!SHORTCODE_RE.test(trimmed)) {
        elements.push({ type: 'other', html: `<div style="text-align:center;font-size:13px;color:#333;margin:8px 0;white-space:pre-wrap;">${esc(trimmed)}</div>` });
        continue;
      }

      // Scan for inline shortcodes
      SHORTCODE_RE.lastIndex = 0;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = SHORTCODE_RE.exec(trimmed)) !== null) {
        const before = trimmed.slice(lastIndex, match.index).trim();
        if (before) {
          elements.push({ type: 'other', html: `<div style="text-align:center;font-size:13px;color:#333;margin:8px 0;white-space:pre-wrap;">${esc(before)}</div>` });
        }
        elements.push(renderShortcodeElement(match[0]));
        lastIndex = match.index + match[0].length;
      }
      const after = trimmed.slice(lastIndex).trim();
      if (after) {
        elements.push({ type: 'other', html: `<div style="text-align:center;font-size:13px;color:#333;margin:8px 0;white-space:pre-wrap;">${esc(after)}</div>` });
      }
    }

    // Compose HTML, batching consecutive QR elements into a side-by-side flex container
    const htmlParts: string[] = [];
    let ei = 0;
    while (ei < elements.length) {
      if (elements[ei].type === 'qr' && ei + 1 < elements.length && elements[ei + 1].type === 'qr') {
        // Side-by-side pair
        htmlParts.push(`<div style="display:flex;justify-content:center;gap:16px;margin:12px 0;">${elements[ei].html}${elements[ei + 1].html}</div>`);
        ei += 2;
      } else if (elements[ei].type === 'qr') {
        // Solo QR — wrap with centering
        htmlParts.push(`<div style="text-align:center;margin:12px 0;">${elements[ei].html}</div>`);
        ei++;
      } else {
        htmlParts.push(elements[ei].html);
        ei++;
      }
    }

    return htmlParts.join('');
  };

  const belowHeaderZones = getZonesForPlacement(c, tx, 'below_header');
  const belowHeaderHtml = belowHeaderZones.length > 0
    ? belowHeaderZones.map(zoneDiv).join(zoneDivider) + zoneDivider
    : '';

  const aboveFooterZones = getZonesForPlacement(c, tx, 'above_footer');
  const aboveFooterHtml = aboveFooterZones.length > 0
    ? aboveFooterZones.map(zoneDiv).join(zoneDivider)
    : '';

  const belowFooterZones = getZonesForPlacement(c, tx, 'below_footer');
  const belowFooterHtml = belowFooterZones.length > 0
    ? belowFooterZones.map(zoneDiv).join(zoneDivider)
    : '';

  // Customer Since string for HTML
  let customerSinceStr = '';
  if (tx.customer?.created_at) {
    const d = new Date(tx.customer.created_at);
    customerSinceStr = d.toLocaleDateString('en-US', { month: 'short' }) + ' ' + d.getFullYear();
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-modes" content="light dark">
<style>
  @media (prefers-color-scheme: dark) {
    body { background: #1a1a1a !important; }
    .receipt-wrap { background: #222 !important; border-color: #444 !important; color: #e0e0e0 !important; }
    .receipt-wrap a { color: #cccccc !important; }
    .receipt-wrap hr { border-color: #555 !important; }
    .receipt-wrap td, .receipt-wrap div { color: #e0e0e0 !important; }
    .receipt-wrap .tx-col { color: #aaa !important; }
  }
</style>
</head>
<body style="margin:0;padding:20px;background:#f5f5f5;">
<div class="receipt-wrap" style="max-width:400px;margin:0 auto;background:#fff;border:1px solid #ddd;padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#222;line-height:1.5;position:relative;overflow:hidden;">
  ${htmlIsVoided ? `<!-- VOIDED watermark overlay -->
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:72px;font-weight:bold;color:rgba(220,38,38,0.12);white-space:nowrap;pointer-events:none;z-index:1;letter-spacing:8px;">VOIDED</div>
  <!-- VOIDED banner -->
  <div style="text-align:center;margin:0 -20px 16px;padding:10px 20px;background:#dc2626;color:#fff;font-size:16px;font-weight:bold;letter-spacing:2px;">VOIDED</div>` : ''}

  <!-- Header -->
  ${c.logo_placement === 'above_name' ? logoHtml : ''}
  <div style="text-align:center;margin-bottom:16px;">
    <div style="font-size:18px;font-weight:bold;letter-spacing:1px;">${esc(c.name)}</div>
    ${c.logo_placement === 'below_name' ? logoHtml : ''}
    <div style="font-size:13px;margin-top:4px;"><a style="${linkStyle}">${esc(c.address)}</a></div>
    <div style="font-size:13px;"><a href="tel:${esc(c.phone.replace(/[^+\d]/g, ''))}" style="${linkStyle}">${esc(c.phone)}</a></div>
    ${emailLine}
    ${websiteLine}
  </div>

  <hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">

  ${belowHeaderHtml}

  <!-- Receipt info (3 lines: receipt#/date, name/phone, email/since) -->
  <table style="width:100%;font-size:14px;margin-bottom:4px;">
    <tr>
      <td>Receipt #${esc(tx.receipt_number || 'N/A')}</td>
      <td style="text-align:right;">${esc(date)}</td>
    </tr>
    ${tx.customer ? `<tr>
      <td>${esc(tx.customer.first_name)} ${esc(tx.customer.last_name)}, ${esc(tx.customer.customer_type === 'professional' ? 'Professional' : 'Enthusiast')}</td>
      <td style="text-align:right;">${tx.customer.phone ? esc(formatPhone(tx.customer.phone)) : ''}</td>
    </tr>` : ''}
    ${tx.customer && (tx.customer.email || customerSinceStr) ? `<tr>
      <td>${tx.customer.email ? esc(tx.customer.email) : ''}</td>
      <td style="text-align:right;">${customerSinceStr ? `Customer Since: ${esc(customerSinceStr)}` : ''}</td>
    </tr>` : ''}
    ${vehicleDesc ? `<tr>
      <td colspan="2" style="font-size:13px;color:#444;">${esc(vehicleDesc)}</td>
    </tr>` : ''}
  </table>

  ${/* Phase 1A LOCKED-5: BOOKING DEPOSIT badge retired. */ ''}
  ${htmlIsVoided ? `<div style="text-align:center;margin:8px 0;">
    <span style="display:inline-block;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:bold;color:#fff;background:#dc2626;">VOIDED</span>
  </div>` : htmlRefundStatus !== 'none' ? `<div style="text-align:center;margin:8px 0;padding:6px 12px;display:inline-block;width:100%;box-sizing:border-box;">
    <span style="display:inline-block;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:bold;color:#fff;background:${htmlRefundStatus === 'full' ? '#dc2626' : '#d97706'};">
      ${htmlRefundStatus === 'full' ? 'REFUNDED' : 'PARTIALLY REFUNDED'}
    </span>
  </div>` : ''}

  <hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">

  <!-- Items -->
  <table style="width:100%;border-collapse:collapse;">
    ${itemRows}
  </table>

  <hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">

  <!-- Totals -->
  <table style="width:100%;border-collapse:collapse;">
    ${totals.join('')}
    <tr>
      <td colspan="2" style="padding:4px 0;"><hr style="border:none;border-top:1px solid #333;margin:0;"></td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:15px;font-weight:bold;">TOTAL</td>
      <!-- Use the larger of appointment_total and transaction.total_amount.
           Handles both close-out shells (transaction is $0, appointment carries
           gross) AND in-store sales that exceed appointment value (transaction
           carries gross, appointment is stale). Mirrors the thermal renderer's
           policy in this same file. Phase 1A LOCKED-5: no longer branches on
           tx.is_deposit ("TOTAL CHARGED" relabel + EST. BALANCE DUE row +
           "Final balance may include additional services" footnote retired). -->
      <td style="padding:6px 0;font-size:15px;font-weight:bold;text-align:right;">$${(Math.max(tx.appointment_total ?? 0, tx.total_amount ?? 0) + tx.tip_amount).toFixed(2)}</td>
    </tr>
    ${tx.linked_receipt ? `<tr>
      <td colspan="2" style="padding:6px 0;font-size:12px;color:#2563eb;text-align:center;">See also: ${esc(tx.linked_receipt.label)} #${esc(tx.linked_receipt.receipt_number)}</td>
    </tr>` : ''}
  </table>

  <hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">

  <!-- Payments -->
  <div style="font-size:13px;color:#333;margin-bottom:4px;font-weight:bold;">Payment</div>
  <table style="width:100%;border-collapse:collapse;">
    ${paymentRows}
  </table>

  ${(() => {
    const htmlProcessedRefunds = (tx.refunds ?? []).filter((r) => r.status === 'processed');
    if (htmlProcessedRefunds.length === 0) return '';
    return htmlProcessedRefunds.map((refund) => {
      // Per-method "Refunded to:" — rendered when refunds.notes carried a
      // JSON {sources:[...]} breakdown (split tender or close-out). Stripe
      // refund id appears as a small monospace tag at the end of card lines
      // for operator reconciliation.
      const sourcesBlock = refund.sources && refund.sources.length > 0 ? `
    <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #f3c2c2;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Refunded to</div>
      ${refund.sources.map((source) => {
        const stripeTag = source.method === 'card' && source.stripe_refund_id
          ? ` <span style="display:inline-block;margin-left:6px;padding:1px 5px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;color:#666;background:#f5f5f5;border-radius:3px;">${esc(source.stripe_refund_id)}</span>`
          : '';
        return `<div style="display:flex;justify-content:space-between;font-size:12px;color:#444;padding:1px 0;">
          <span>${esc(formatRefundSourceLabel(source))}${stripeTag}</span>
          <span style="font-variant-numeric:tabular-nums;">-$${Number(source.amount).toFixed(2)}</span>
        </div>`;
      }).join('')}
    </div>` : '';
      return `
  <hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">
  <div style="border-left:3px solid #dc2626;padding-left:10px;margin:8px 0;">
    <div style="font-size:13px;font-weight:bold;color:#dc2626;">Refund</div>
    <div style="font-size:12px;color:#666;margin-top:2px;">${formatRefundDate(refund.created_at)}</div>
    ${refund.reason ? `<div style="font-size:12px;color:#666;">Reason: ${esc(refund.reason)}</div>` : ''}
    <div style="font-size:14px;font-weight:bold;color:#dc2626;margin-top:4px;">-$${refund.amount.toFixed(2)}</div>
    ${refund.points_clawed_back > 0 ? `<div style="font-size:12px;color:#dc2626;margin-top:2px;">Points Reversed: -${refund.points_clawed_back}</div>` : ''}
    ${refund.points_restored > 0 ? `<div style="font-size:12px;color:#16a34a;margin-top:2px;">Points Restored: +${refund.points_restored}</div>` : ''}${sourcesBlock}
  </div>`;
    }).join('');
  })()}

  ${(() => {
    if (tx.customer && (tx.loyalty_points_earned ?? 0) > 0) {
      const dollarValue = (tx.loyalty_points_earned! * LOYALTY.REDEEM_RATE).toFixed(2);
      return `<hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">
  <div style="text-align:center;font-size:13px;color:#16a34a;padding:4px 0;">Points Earned Today: ${tx.loyalty_points_earned} ($${dollarValue} loyalty cash)</div>`;
    } else if (!tx.customer) {
      const hypotheticalPoints = Math.floor(tx.subtotal * LOYALTY.EARN_RATE);
      if (hypotheticalPoints > 0) {
        const dollarValue = (hypotheticalPoints * LOYALTY.REDEEM_RATE).toFixed(2);
        return `<hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">
  <div style="text-align:center;font-size:13px;color:#16a34a;padding:4px 0;">Join our rewards program &mdash; this visit would&rsquo;ve earned you $${dollarValue} off!</div>`;
      }
      return '';
    }
    return '';
  })()}

  ${c.logo_placement === 'above_footer' ? logoHtml : ''}
  ${aboveFooterHtml}

  <!-- Footer zones -->
  ${belowFooterHtml}
</div>
</body>
</html>`;
}

function row(left: string, right: string, color?: string): string {
  const style = color ? `;color:${color}` : '';
  return `<tr>
    <td style="padding:3px 0;font-size:14px${style}">${left}</td>
    <td style="padding:3px 0;font-size:14px;text-align:right${style}">${right}</td>
  </tr>`;
}

// ---------------------------------------------------------------------------
// ESC/POS Binary Renderer — Star TSP100III via local print server
// ---------------------------------------------------------------------------

// Star TSP100 ESC/POS command bytes
const ESC = 0x1B;
const LF = 0x0A;

const CMD_INIT = [ESC, 0x40]; // Initialize printer
// Standard ESC/POS commands — NO 0x1D bytes (except logo trigger and cut)
// futurePRNT inserts NV logo at every 0x1D after ESC @ init.
// Only two 0x1D bytes allowed: CMD_LOGO_TRIGGER (logo) and CMD_CUT (cut).
const CMD_LOGO_TRIGGER = [0x1D, 0x42, 0x00]; // GS B 0 — disable reverse (no-op), triggers futurePRNT logo
const CMD_ALIGN_LEFT = [ESC, 0x61, 0x00];     // ESC a 0
const CMD_ALIGN_CENTER = [ESC, 0x61, 0x01];   // ESC a 1
const _CMD_ALIGN_RIGHT = [ESC, 0x61, 0x02];    // ESC a 2
const CMD_BOLD_ON = [ESC, 0x45, 0x01];         // ESC E 1 (unchanged)
const _CMD_BOLD_OFF = [ESC, 0x45, 0x00];        // ESC E 0 (unchanged)
const CMD_DOUBLE_SIZE = [ESC, 0x21, 0x30];     // ESC ! 0x30 — double width + double height
const CMD_NORMAL_SIZE = [ESC, 0x21, 0x00];     // ESC ! 0x00 — normal size
const CMD_CUT = [0x1D, 0x56, 0x01];            // GS V partial cut (at end only)

// Common non-ASCII typography characters that the Star TSP100III code page
// can't render — substitute with ASCII-safe equivalents BEFORE the byte
// emit so we don't end up with "?" placeholders on the thermal print.
// Add to this map when you discover a new offender (logs will surface it
// via the console.warn below).
// Phase 1A-followup FIX 3: map shape changed from Record<string, string> to
// Record<string, number[]>. Some chars (e.g., middle dot) have a CP437
// codepoint and should emit that byte directly to preserve design intent;
// others fall through to ASCII substitution.
const THERMAL_SUBSTITUTIONS: Record<string, number[]> = {
  '·': [0xFA], // middle dot — CP437 byte 0xFA renders the actual character
  '—': [0x2D], // em dash → ASCII -
  '–': [0x2D], // en dash → ASCII -
  '‘': [0x27], // left single quote → '
  '’': [0x27], // right single quote / apostrophe → '
  '“': [0x22], // left double quote → "
  '”': [0x22], // right double quote → "
  '…': [0x2E, 0x2E, 0x2E], // ellipsis → ...
  ' ': [0x20], // non-breaking space → regular space
  '✓': [0xFB], // check mark → CP437 0xFB (RADICAL √). Phase 1A-followup-2: CP437 has no exact ✓; 0xFB is the industry-standard thermal "almost-check" glyph, visually a tick.
};

function textToBytes(text: string): number[] {
  const bytes: number[] = [];
  // Per-character pass: substitution map values are byte arrays so each
  // char emits one or more bytes (e.g., '·' → [0xFA] preserves middle-dot
  // via CP437; '…' → [0x2E, 0x2E, 0x2E] degrades to ASCII '...').
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const subs = THERMAL_SUBSTITUTIONS[ch];
    if (subs) {
      bytes.push(...subs);
      continue;
    }
    const code = text.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
      continue;
    }
    // Unmapped non-ASCII — surface in dev logs so future regressions
    // (e.g. someone adding a new emoji or accent to a template) are
    // immediately visible. Then substitute '?' as today.
    console.warn(
      `[ESC/POS] Non-ASCII char U+${code.toString(16).padStart(4, '0').toUpperCase()} in receipt text — substituting '?'. Add to THERMAL_SUBSTITUTIONS if recurring.`
    );
    bytes.push(0x3F);
  }
  return bytes;
}

/**
 * Word-wrap a string to a fixed column width, breaking at whitespace.
 * If a single word is wider than `width`, hard-break it across lines so the
 * printer never sees an over-length line (the Star TSP100III auto-wraps
 * mid-character at the column boundary, which produces ugly mid-word breaks).
 *
 * Returns the wrapped lines as strings, no trailing whitespace.
 */
function wrapTextToWidth(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const out: string[] = [];
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  let current = '';
  for (const word of words) {
    if (word.length > width) {
      // Word longer than the line — flush current, then hard-break the word.
      if (current.length > 0) {
        out.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += width) {
        const chunk = word.slice(i, i + width);
        if (chunk.length === width) {
          out.push(chunk);
        } else {
          current = chunk;
        }
      }
      continue;
    }
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      out.push(current);
      current = word;
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Convert receipt lines to Star TSP100 ESC/POS binary commands.
 * Matches the visual layout of generateReceiptHtml() as closely
 * as a 48-column thermal printer allows:
 * - Logo handled by printer NV memory (futurePRNT) — image lines are no-ops
 * - TOTAL line in bold + double-size (matches HTML bold/15px)
 * - "Payment" label before payment rows (matches HTML bold label)
 * - Empty bold line rendered as spacer (matches HTML solid <hr>)
 */
export function receiptToEscPos(
  lines: ReceiptLine[],
  width = 48
): Uint8Array {
  const parts: number[] = [];

  // Initialize printer
  parts.push(...CMD_INIT);
  // Trigger futurePRNT to insert NV logo (must be first 0x1D after init)
  parts.push(...CMD_LOGO_TRIGGER);
  parts.push(LF); // Space after logo
  parts.push(...CMD_BOLD_ON); // Bold on globally for crisp dark text

  // State tracking to match HTML semantic sections
  let seenTotal = false;
  let paymentLabelAdded = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    switch (line.type) {
      case 'header':
        parts.push(...CMD_ALIGN_CENTER);
        parts.push(...CMD_DOUBLE_SIZE);
        parts.push(...CMD_BOLD_ON);
        parts.push(...textToBytes(line.text ?? ''));
        parts.push(LF);
        parts.push(...CMD_NORMAL_SIZE);
        parts.push(...CMD_BOLD_ON); // Re-enable bold (ESC ! reset it)
        parts.push(LF); // Space after business name
        break;

      case 'text': {
        // Server-side word-wrap so long centered lines (e.g. "Join our rewards
        // program – this visit would've earned you $X.XX off!") break at
        // whitespace. Without this, the printer's character-level auto-wrap
        // produces mid-word breaks like "...would've e\narned you...".
        parts.push(...CMD_ALIGN_CENTER);
        const wrapped = wrapTextToWidth(line.text ?? '', width);
        for (const sub of wrapped) {
          parts.push(...textToBytes(sub));
          parts.push(LF);
        }
        break;
      }

      case 'bold':
        if (!(line.text ?? '').trim()) {
          parts.push(LF);
        } else {
          parts.push(...textToBytes(line.text ?? ''));
          parts.push(LF);
        }
        break;

      case 'divider':
        parts.push(...CMD_ALIGN_LEFT);
        parts.push(...textToBytes('-'.repeat(width)));
        parts.push(LF);
        if (seenTotal && !paymentLabelAdded) {
          paymentLabelAdded = true;
          parts.push(...textToBytes('Payment'));
          parts.push(LF);
        }
        break;

      case 'columns': {
        parts.push(...CMD_ALIGN_LEFT);
        const left = line.left ?? '';
        const center = line.center ?? '';
        const right = line.right ?? '';

        const isTotalLine = left === 'TOTAL';
        if (isTotalLine) {
          seenTotal = true;
          parts.push(...CMD_DOUBLE_SIZE);
          parts.push(...CMD_BOLD_ON);
        }

        let padded: string;
        if (center) {
          const usedLen = left.length + center.length + right.length;
          const totalGap = Math.max(2, width - usedLen);
          const gapLeft = Math.ceil(totalGap / 2);
          const gapRight = totalGap - gapLeft;
          padded = left + ' '.repeat(gapLeft) + center + ' '.repeat(gapRight) + right;
        } else {
          const effectiveWidth = isTotalLine ? Math.floor(width / 2) : width;
          const gap = effectiveWidth - left.length - right.length;
          padded = left + ' '.repeat(Math.max(1, gap)) + right;
        }
        parts.push(...textToBytes(padded));
        parts.push(LF);

        if (isTotalLine) {
          parts.push(...CMD_NORMAL_SIZE);
          parts.push(...CMD_BOLD_ON);
        }
        break;
      }

      case 'spacer':
        parts.push(LF);
        break;

      case 'image':
        break;

      case 'barcode': {
        if (line.barcodeData) {
          parts.push(...CMD_ALIGN_CENTER);
          parts.push(0x1D, 0x68, 0x50);
          parts.push(0x1D, 0x77, 0x02);
          parts.push(0x1D, 0x48, 0x02);
          const barcodeStr = '{B' + line.barcodeData;
          const barcodeLen = barcodeStr.length;
          parts.push(0x1D, 0x6B, 0x49, barcodeLen);
          parts.push(...textToBytes(barcodeStr));
          parts.push(LF);
        }
        break;
      }

      case 'qr': {
        if (!line.qrData) break;

        // Look ahead: if next line is also QR, render them side-by-side
        const nextLine = li + 1 < lines.length ? lines[li + 1] : null;
        const isPair = nextLine?.type === 'qr' && nextLine?.qrData;

        if (isPair) {
          // --- Side-by-side QR pair (EQUAL size via fractional module mapping) ---
          // Instead of integer moduleSize (which causes rounding gaps between QR codes
          // with different module counts), we map each output pixel to its module using
          // fractional division: floor(x * totalModules / targetPx). This is the 1-bit
          // equivalent of CSS sub-pixel scaling — both QR patterns fill their canvas
          // completely at EXACTLY targetPx x targetPx, regardless of module count.
          const PRINTER_WIDTH = 384; // 48 bytes * 8 bits = 384 px
          const GAP = 20;            // px gap between the two QR codes
          const QUIET = 2;           // quiet zone modules around each QR

          try {
            // 1. Generate both QR matrices
            const qr1 = QRCode.create(line.qrData, { errorCorrectionLevel: 'M' });
            const qr2 = QRCode.create(nextLine.qrData!, { errorCorrectionLevel: 'M' });
            const mod1 = qr1.modules.size;
            const mod2 = qr2.modules.size;

            // 2. Fixed target size per QR — both are EXACTLY this many pixels
            const targetPx = Math.floor((PRINTER_WIDTH - GAP) / 2);

            // 3. Total modules including quiet zone for each QR
            const total1 = mod1 + 2 * QUIET;
            const total2 = mod2 + 2 * QUIET;

            // 4. Center the combined image within the full printer width
            const combinedWidth = targetPx * 2 + GAP;
            const leftPad = Math.floor((PRINTER_WIDTH - combinedWidth) / 2);

            // Debug logging
            console.log('[QR Pair – fractional mapping]', {
              mod1, mod2, total1, total2,
              targetPx, combinedWidth, leftPad,
            });

            // 5. Labels rendered as pixels inside the raster (see below)
            const label1 = line.qrLabel || '';
            const label2 = nextLine.qrLabel || '';

            // 6. Build ONE combined raster bitmap — labels + QR codes on SAME coordinate system
            //    Layout: [label rows] [gap] [QR rows]
            //    Labels are rendered as pixels in a 5x7 bitmap font — same coordinate
            //    system as QR codes, so centering is pixel-perfect (no char rounding).
            const FONT_H = 7;
            const FONT_W = 5;
            const CHAR_GAP = 1;
            const SCALE = 2;       // 2x scale — each glyph pixel becomes a 2x2 block
            const LABEL_GAP = 5;   // px between label bottom and QR top

            const scaledH = FONT_H * SCALE;
            const bytesPerRow = PRINTER_WIDTH / 8; // 48 bytes
            const labelTop = 0;
            const qrTop = scaledH + LABEL_GAP;
            const imgHeight = qrTop + targetPx;
            const rasterData = new Uint8Array(bytesPerRow * imgHeight);

            // 5x7 bitmap font — only chars needed for "Review on Google" / "Review on Yelp"
            // Each glyph = 7 rows; each row's lower 5 bits = pixel columns (MSB = left)
            const GLYPH: Record<string, number[]> = {
              'R': [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
              'e': [0x00, 0x00, 0x0E, 0x11, 0x1F, 0x10, 0x0E],
              'v': [0x00, 0x00, 0x11, 0x11, 0x11, 0x0A, 0x04],
              'i': [0x04, 0x00, 0x0C, 0x04, 0x04, 0x04, 0x0E],
              'w': [0x00, 0x00, 0x11, 0x11, 0x15, 0x15, 0x0A],
              'o': [0x00, 0x00, 0x0E, 0x11, 0x11, 0x11, 0x0E],
              'n': [0x00, 0x00, 0x16, 0x19, 0x11, 0x11, 0x11],
              ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
              'G': [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F],
              'g': [0x00, 0x00, 0x0F, 0x11, 0x0F, 0x01, 0x0E],
              'l': [0x0C, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
              'Y': [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
              'p': [0x00, 0x00, 0x16, 0x19, 0x1E, 0x10, 0x10],
            };

            // Render a label string into the raster at SCALE×, centered at centerX
            const renderLabel = (text: string, centerX: number) => {
              const scaledCharW = FONT_W * SCALE;
              const scaledGap = CHAR_GAP * SCALE;
              const totalW = text.length * (scaledCharW + scaledGap) - scaledGap;
              const startX = Math.max(0, Math.round(centerX - totalW / 2));
              for (let ci = 0; ci < text.length; ci++) {
                const glyph = GLYPH[text[ci]];
                if (!glyph) continue;
                const charX = startX + ci * (scaledCharW + scaledGap);
                for (let gy = 0; gy < FONT_H; gy++) {
                  const rowBits = glyph[gy];
                  for (let gx = 0; gx < FONT_W; gx++) {
                    if (rowBits & (0x10 >> gx)) {
                      // Fill a SCALE×SCALE block for each glyph pixel
                      for (let sy = 0; sy < SCALE; sy++) {
                        for (let sx = 0; sx < SCALE; sx++) {
                          const px = charX + gx * SCALE + sx;
                          const py = labelTop + gy * SCALE + sy;
                          if (px >= 0 && px < PRINTER_WIDTH) {
                            const byteIdx = Math.floor(px / 8);
                            const bitIdx = 7 - (px % 8);
                            rasterData[py * bytesPerRow + byteIdx] |= (1 << bitIdx);
                          }
                        }
                      }
                    }
                  }
                }
              }
            };

            // Center each label above its QR code (pixel-perfect — no char rounding)
            const qr1Center = leftPad + targetPx / 2;
            const qr2Center = leftPad + targetPx + GAP + targetPx / 2;
            if (label1) renderLabel(label1, qr1Center);
            if (label2) renderLabel(label2, qr2Center);

            // Helper: fractional module lookup for a QR at a given pixel coordinate
            // Maps pixel (x,y) in [0..targetPx) to module via floor(coord * totalMod / targetPx)
            const isQrBlack = (
              qr: typeof qr1, modSize: number, totalMod: number,
              x: number, y: number
            ): boolean => {
              const mCol = Math.floor(x * totalMod / targetPx) - QUIET;
              const mRow = Math.floor(y * totalMod / targetPx) - QUIET;
              if (mRow >= 0 && mRow < modSize && mCol >= 0 && mCol < modSize) {
                return !!qr.modules.data[mRow * modSize + mCol];
              }
              return false; // quiet zone — white
            };

            // Render QR codes into rows [qrTop .. imgHeight)
            for (let row = qrTop; row < imgHeight; row++) {
              const qrY = row - qrTop;
              for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
                let b = 0;
                for (let bit = 0; bit < 8; bit++) {
                  const px = byteIdx * 8 + bit;
                  let isBlack = false;

                  // QR1 canvas: pixels [leftPad .. leftPad+targetPx)
                  const x1 = px - leftPad;
                  if (x1 >= 0 && x1 < targetPx) {
                    isBlack = isQrBlack(qr1, mod1, total1, x1, qrY);
                  }

                  // QR2 canvas: pixels [leftPad+targetPx+GAP .. leftPad+targetPx+GAP+targetPx)
                  if (!isBlack) {
                    const x2 = px - leftPad - targetPx - GAP;
                    if (x2 >= 0 && x2 < targetPx) {
                      isBlack = isQrBlack(qr2, mod2, total2, x2, qrY);
                    }
                  }

                  if (isBlack) b |= (0x80 >> bit);
                }
                rasterData[row * bytesPerRow + byteIdx] = b;
              }
            }

            // 7. Emit GS v 0 raster command with the combined bitmap
            parts.push(0x1D, 0x76, 0x30, 0x00);
            parts.push(bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF);
            parts.push(imgHeight & 0xFF, (imgHeight >> 8) & 0xFF);
            for (let i = 0; i < rasterData.length; i++) {
              parts.push(rasterData[i]);
            }
          } catch (qrErr) {
            console.error('[ESC/POS] QR pair generation failed:', qrErr);
            parts.push(...CMD_ALIGN_CENTER);
            parts.push(...textToBytes(line.qrData));
            parts.push(LF);
            parts.push(...textToBytes(nextLine.qrData!));
          }

          parts.push(LF);
          li++; // skip next QR line — consumed as pair
        } else {
          // --- Solo QR code (centered) ---
          parts.push(...CMD_ALIGN_CENTER);

          if (line.qrLabel) {
            parts.push(...textToBytes(line.qrLabel));
            parts.push(LF);
          }

          try {
            const qr = QRCode.create(line.qrData, { errorCorrectionLevel: 'M' });
            const size = qr.modules.size;
            const moduleData = qr.modules.data;

            const SCALE = 4;
            const QUIET = 4;
            const totalModules = size + 2 * QUIET;
            const imgWidth = totalModules * SCALE;
            const imgHeight = totalModules * SCALE;
            const bytesPerRow = Math.ceil(imgWidth / 8);

            parts.push(0x1D, 0x76, 0x30, 0x00);
            parts.push(bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF);
            parts.push(imgHeight & 0xFF, (imgHeight >> 8) & 0xFF);

            for (let y = 0; y < imgHeight; y++) {
              const moduleRow = Math.floor(y / SCALE) - QUIET;
              for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                  const x = byteIdx * 8 + bit;
                  if (x >= imgWidth) break;
                  const moduleCol = Math.floor(x / SCALE) - QUIET;
                  if (
                    moduleRow >= 0 && moduleRow < size &&
                    moduleCol >= 0 && moduleCol < size &&
                    moduleData[moduleRow * size + moduleCol]
                  ) {
                    byte |= (0x80 >> bit);
                  }
                }
                parts.push(byte);
              }
            }
          } catch (qrErr) {
            console.error('[ESC/POS] QR generation failed:', qrErr);
            parts.push(...textToBytes(line.qrData));
          }

          parts.push(LF);
        }
        break;
      }
    }
  }

  // Feed a few lines then cut
  parts.push(LF, LF, LF);
  parts.push(...CMD_CUT);

  return new Uint8Array(parts);
}

/**
 * Generate ESC/POS cash drawer kick command for Star TSP100.
 * ESC p without ESC @ init — BEL (0x07) gets swallowed by futurePRNT ESC/POS Routing.
 * No ESC @ init before this — that would trigger a logo printout.
 */
export function escPosOpenDrawer(): Uint8Array {
  return new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]); // ESC p — drawer kick, no init
}
