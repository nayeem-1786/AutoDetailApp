import type { MergedReceiptConfig, CustomTextZone } from '@/lib/data/receipt-config';
import { formatPhone } from '@/lib/utils/format';

interface ReceiptItem {
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tax_amount: number;
  item_type?: string | null;
}

interface ReceiptPayment {
  method: string;
  amount: number;
  tip_amount: number;
  card_brand?: string | null;
  card_last_four?: string | null;
}

export interface ReceiptTransaction {
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
  vehicle?: { year?: number | null; make?: string | null; model?: string | null; color?: string | null } | null;
  items: ReceiptItem[];
  payments: ReceiptPayment[];
}

export interface ReceiptLine {
  type: 'header' | 'text' | 'bold' | 'divider' | 'columns' | 'spacer' | 'image';
  text?: string;
  left?: string;
  center?: string;
  right?: string;
  url?: string;
  width?: number;
  alignment?: 'left' | 'center' | 'right';
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
 * Build a vehicle description string: "Year Color Make Model"
 */
function buildVehicleDesc(v: ReceiptTransaction['vehicle']): string {
  if (!v) return '';
  return [v.year, v.color, v.make, v.model].filter(Boolean).join(' ');
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

/**
 * Generate a structured receipt from transaction data.
 * This can be used by Star WebPRNT or formatted as plain text.
 */
export function generateReceiptLines(tx: ReceiptTransaction, config?: MergedReceiptConfig): ReceiptLine[] {
  const c = config ?? FALLBACK_CONFIG;
  const lines: ReceiptLine[] = [];

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
    lines.push({ type: 'text', text: belowHeaderZones[i] });
  }
  if (belowHeaderZones.length > 0) {
    lines.push({ type: 'divider' });
  }

  // Receipt number & date with time
  lines.push({
    type: 'columns',
    left: `Receipt #${tx.receipt_number || 'N/A'}`,
    right: new Date(tx.transaction_date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }),
  });

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

  lines.push({ type: 'divider' });

  // Build vehicle description for line items
  const vehicleDesc = buildVehicleDesc(tx.vehicle);

  // Items layout:
  //   qty > 1: line 1 = item name (full width, wraps if long)
  //            line 2 = indented qty + price + TX
  //   qty = 1: single line = name + price + TX
  //   Services get an indented vehicle description line below
  for (const item of tx.items) {
    const price = `$${item.total_price.toFixed(2)}`;
    const txCol = item.tax_amount > 0 ? ' TX' : '   ';
    if (item.quantity > 1) {
      lines.push({ type: 'columns', left: item.item_name, right: '' });
      lines.push({
        type: 'columns',
        left: `  ${item.quantity} x $${item.unit_price.toFixed(2)} each`,
        right: `${price}${txCol}`,
      });
    } else {
      lines.push({
        type: 'columns',
        left: item.item_name,
        right: `${price}${txCol}`,
      });
    }

    // Vehicle description under service line items
    if (item.item_type === 'service' && vehicleDesc) {
      lines.push({ type: 'text', text: `   ${vehicleDesc}` });
    }
  }

  lines.push({ type: 'divider' });

  // Totals
  lines.push({
    type: 'columns',
    left: 'Subtotal',
    right: `$${tx.subtotal.toFixed(2)}`,
  });

  if (tx.tax_amount > 0) {
    lines.push({
      type: 'columns',
      left: 'Tax',
      right: `$${tx.tax_amount.toFixed(2)}`,
    });
  }

  if (tx.discount_amount > 0) {
    const discountLabel = tx.coupon_code ? `Coupon (${tx.coupon_code})` : 'Discount';
    lines.push({
      type: 'columns',
      left: discountLabel,
      right: `-$${tx.discount_amount.toFixed(2)}`,
    });
  }

  if (tx.loyalty_discount && tx.loyalty_discount > 0) {
    const ptsLabel = tx.loyalty_points_redeemed ? ` (${tx.loyalty_points_redeemed} pts)` : '';
    lines.push({
      type: 'columns',
      left: `Loyalty${ptsLabel}`,
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

  lines.push({
    type: 'bold',
    text: '',
  });
  lines.push({
    type: 'columns',
    left: 'TOTAL',
    right: `$${tx.total_amount.toFixed(2)}`,
  });

  lines.push({ type: 'divider' });

  // Payments
  for (const p of tx.payments) {
    const label =
      p.method === 'card' && p.card_brand
        ? `${p.card_brand} ****${p.card_last_four}`
        : p.method.toUpperCase();
    lines.push({
      type: 'columns',
      left: label,
      right: `$${p.amount.toFixed(2)}`,
    });
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
    lines.push({ type: 'text', text: aboveFooterZones[i] });
  }

  // Custom text zones: below_footer
  const belowFooterZones = getZonesForPlacement(c, tx, 'below_footer');
  if (belowFooterZones.length > 0) {
    lines.push({ type: 'spacer' });
    for (let i = 0; i < belowFooterZones.length; i++) {
      if (i > 0) lines.push({ type: 'divider' });
      lines.push({ type: 'text', text: belowFooterZones[i] });
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
  return lines
    .map((line) => {
      switch (line.type) {
        case 'header':
          return centerText(line.text ?? '', width);
        case 'text':
          return centerText(line.text ?? '', width);
        case 'bold':
          return line.text ?? '';
        case 'divider':
          return '-'.repeat(width);
        case 'columns': {
          const left = line.left ?? '';
          const center = line.center ?? '';
          const right = line.right ?? '';
          if (center) {
            const usedLen = left.length + center.length + right.length;
            const totalGap = Math.max(2, width - usedLen);
            const gapLeft = Math.ceil(totalGap / 2);
            const gapRight = totalGap - gapLeft;
            return left + ' '.repeat(gapLeft) + center + ' '.repeat(gapRight) + right;
          }
          const gap = width - left.length - right.length;
          return left + ' '.repeat(Math.max(1, gap)) + right;
        }
        case 'spacer':
          return '';
        case 'image':
          return ''; // skip images in plain text
        default:
          return '';
      }
    })
    .join('\n');
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
export function generateReceiptHtml(tx: ReceiptTransaction, config?: MergedReceiptConfig): string {
  const c = config ?? FALLBACK_CONFIG;
  const date = new Date(tx.transaction_date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  // Build vehicle description for line items
  const vehicleDesc = buildVehicleDesc(tx.vehicle);

  const itemRows = tx.items
    .map((item) => {
      const txCell = item.tax_amount > 0 ? 'TX' : '';
      let rows = '';
      if (item.quantity > 1) {
        rows += `<tr>
          <td colspan="3" style="padding:4px 0 0;font-size:14px;">${esc(item.item_name)}</td>
        </tr>
        <tr>
          <td style="padding:0 0 4px 12px;font-size:13px;color:#444;">${item.quantity} x $${item.unit_price.toFixed(2)} each</td>
          <td style="padding:0 0 4px;font-size:14px;text-align:right;white-space:nowrap;">$${item.total_price.toFixed(2)}</td>
          <td style="padding:0 0 4px 8px;font-size:11px;color:#555;white-space:nowrap;width:20px;">${txCell}</td>
        </tr>`;
      } else {
        rows += `<tr>
        <td style="padding:4px 0;font-size:14px;">${esc(item.item_name)}</td>
        <td style="padding:4px 0;font-size:14px;text-align:right;white-space:nowrap;">$${item.total_price.toFixed(2)}</td>
        <td style="padding:4px 0 4px 8px;font-size:11px;color:#555;white-space:nowrap;width:20px;">${txCell}</td>
      </tr>`;
      }

      // Vehicle description under service line items
      if (item.item_type === 'service' && vehicleDesc) {
        rows += `<tr>
        <td colspan="3" style="padding:0 0 4px 12px;font-size:13px;color:#666;">${esc(vehicleDesc)}</td>
      </tr>`;
      }

      return rows;
    })
    .join('');

  const totals: string[] = [];
  totals.push(row('Subtotal', `$${tx.subtotal.toFixed(2)}`));
  if (tx.tax_amount > 0) totals.push(row('Tax', `$${tx.tax_amount.toFixed(2)}`));
  if (tx.discount_amount > 0) {
    const discountLabel = tx.coupon_code ? `Coupon (${tx.coupon_code})` : 'Discount';
    totals.push(row(discountLabel, `-$${tx.discount_amount.toFixed(2)}`, '#16a34a'));
  }
  if (tx.loyalty_discount && tx.loyalty_discount > 0) {
    const ptsLabel = tx.loyalty_points_redeemed ? ` (${tx.loyalty_points_redeemed} pts)` : '';
    totals.push(row(`Loyalty${ptsLabel}`, `-$${tx.loyalty_discount.toFixed(2)}`, '#d97706'));
  }
  if (tx.tip_amount > 0) totals.push(row('Tip', `$${tx.tip_amount.toFixed(2)}`));

  const paymentRows = tx.payments
    .map((p) => {
      const label =
        p.method === 'card' && p.card_brand
          ? `${esc(p.card_brand)} ****${esc(p.card_last_four || '')}`
          : p.method.toUpperCase();
      return row(label, `$${p.amount.toFixed(2)}`);
    })
    .join('');

  const logoAlign = c.logo_alignment || 'center';
  const logoHtml = c.logo_url
    ? `<div style="text-align:${logoAlign};margin:8px 0;"><img src="${esc(c.logo_url)}" alt="" style="display:inline-block;width:${c.logo_width}px;max-width:100%;height:auto;" /></div>`
    : '';

  const linkStyle = 'color:#444444;text-decoration:none;';
  const emailLine = c.email ? `<div style="font-size:13px;"><a href="mailto:${esc(c.email)}" style="${linkStyle}">${esc(c.email)}</a></div>` : '';
  const websiteLine = c.website ? `<div style="font-size:13px;"><a href="${esc(c.website)}" style="${linkStyle}">${esc(c.website)}</a></div>` : '';

  // Build zone HTML for each placement
  const zoneDivider = '<hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">';
  const zoneDiv = (t: string) => `<div style="text-align:center;font-size:13px;color:#333;margin:8px 0;white-space:pre-wrap;">${esc(t)}</div>`;

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
<div class="receipt-wrap" style="max-width:400px;margin:0 auto;background:#fff;border:1px solid #ddd;padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#222;line-height:1.5;">
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
  </table>

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
      <td style="padding:6px 0;font-size:15px;font-weight:bold;text-align:right;">$${tx.total_amount.toFixed(2)}</td>
    </tr>
  </table>

  <hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">

  <!-- Payments -->
  <div style="font-size:13px;color:#333;margin-bottom:4px;font-weight:bold;">Payment</div>
  <table style="width:100%;border-collapse:collapse;">
    ${paymentRows}
  </table>

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
const CMD_ALIGN_LEFT = [ESC, 0x1D, 0x61, 0x00];
const CMD_ALIGN_CENTER = [ESC, 0x1D, 0x61, 0x01];
const CMD_ALIGN_RIGHT = [ESC, 0x1D, 0x61, 0x02];
const CMD_BOLD_ON = [ESC, 0x45, 0x01];
const CMD_BOLD_OFF = [ESC, 0x45, 0x00];
const CMD_DOUBLE_SIZE = [ESC, 0x69, 0x01, 0x01]; // Double height + width
const CMD_NORMAL_SIZE = [ESC, 0x69, 0x00, 0x00];
const CMD_CUT = [ESC, 0x64, 0x02]; // Partial cut
const CMD_CASH_DRAWER = [ESC, 0x70, 0x00, 0x19, 0xFA]; // Kick pin 2

function textToBytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // ASCII-safe: replace non-ASCII with '?'
    bytes.push(code < 128 ? code : 0x3F);
  }
  return bytes;
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

  // State tracking to match HTML semantic sections
  let seenTotal = false;
  let paymentLabelAdded = false;

  for (const line of lines) {
    switch (line.type) {
      case 'header':
        parts.push(...CMD_ALIGN_CENTER);
        parts.push(...CMD_BOLD_ON);
        parts.push(...CMD_DOUBLE_SIZE);
        parts.push(...textToBytes(line.text ?? ''));
        parts.push(LF);
        parts.push(...CMD_NORMAL_SIZE);
        parts.push(...CMD_BOLD_OFF);
        break;

      case 'text':
        parts.push(...CMD_ALIGN_CENTER);
        parts.push(...textToBytes(line.text ?? ''));
        parts.push(LF);
        break;

      case 'bold':
        if (!(line.text ?? '').trim()) {
          // Empty bold line = visual separator before TOTAL
          // (matches the solid <hr> in the HTML preview between subtotals and TOTAL)
          parts.push(LF);
        } else {
          parts.push(...CMD_BOLD_ON);
          parts.push(...textToBytes(line.text ?? ''));
          parts.push(LF);
          parts.push(...CMD_BOLD_OFF);
        }
        break;

      case 'divider':
        parts.push(...CMD_ALIGN_LEFT);
        parts.push(...textToBytes('-'.repeat(width)));
        parts.push(LF);
        // After the divider following TOTAL, add bold "Payment" label
        // (matches HTML: <div font-weight:bold>Payment</div>)
        if (seenTotal && !paymentLabelAdded) {
          paymentLabelAdded = true;
          parts.push(...CMD_BOLD_ON);
          parts.push(...textToBytes('Payment'));
          parts.push(LF);
          parts.push(...CMD_BOLD_OFF);
        }
        break;

      case 'columns': {
        parts.push(...CMD_ALIGN_LEFT);
        const left = line.left ?? '';
        const center = line.center ?? '';
        const right = line.right ?? '';

        // TOTAL line — bold + double-size to match HTML bold/15px styling
        const isTotalLine = left === 'TOTAL';
        if (isTotalLine) {
          seenTotal = true;
          parts.push(...CMD_BOLD_ON);
          parts.push(...CMD_DOUBLE_SIZE);
        }

        let padded: string;
        if (center) {
          const usedLen = left.length + center.length + right.length;
          const totalGap = Math.max(2, width - usedLen);
          const gapLeft = Math.ceil(totalGap / 2);
          const gapRight = totalGap - gapLeft;
          padded = left + ' '.repeat(gapLeft) + center + ' '.repeat(gapRight) + right;
        } else {
          // Double-size chars take 2 columns each, so halve effective width
          const effectiveWidth = isTotalLine ? Math.floor(width / 2) : width;
          const gap = effectiveWidth - left.length - right.length;
          padded = left + ' '.repeat(Math.max(1, gap)) + right;
        }
        parts.push(...textToBytes(padded));
        parts.push(LF);

        if (isTotalLine) {
          parts.push(...CMD_NORMAL_SIZE);
          parts.push(...CMD_BOLD_OFF);
        }
        break;
      }

      case 'spacer':
        parts.push(LF);
        break;

      case 'image':
        // Logo is stored in printer NV memory via Star futurePRNT — no ESC/POS output needed
        break;
    }
  }

  // Feed a few lines then cut
  parts.push(LF, LF, LF);
  parts.push(...CMD_CUT);

  return new Uint8Array(parts);
}

/**
 * Generate ESC/POS cash drawer kick command for Star TSP100.
 */
export function escPosOpenDrawer(): Uint8Array {
  return new Uint8Array([...CMD_INIT, ...CMD_CASH_DRAWER]);
}
