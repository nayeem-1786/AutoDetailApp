import type { MergedReceiptConfig, CustomTextZone } from '@/lib/data/receipt-config';
import { formatPhone } from '@/lib/utils/format';
import QRCode from 'qrcode';

interface ReceiptItem {
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tax_amount: number;
  item_type?: string | null;
  standard_price?: number | null;
  pricing_type?: string | null;
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
  vehicle?: { vehicle_type?: string | null; year?: number | null; make?: string | null; model?: string | null; color?: string | null } | null;
  items: ReceiptItem[];
  payments: ReceiptPayment[];
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

/**
 * Build a vehicle description string: "Type | Year Color Make Model"
 */
function buildVehicleDesc(v: ReceiptTransaction['vehicle']): string {
  if (!v) return '';
  const typeLabel = getVehicleTypeLabel(v.vehicle_type);
  const details = [v.year, v.color, v.make, v.model].filter(Boolean).join(' ');
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

    // Sale/combo savings sub-text
    if (item.pricing_type && item.pricing_type !== 'standard' && item.standard_price != null && item.standard_price > item.unit_price) {
      const savings = item.standard_price - item.unit_price;
      const label = item.pricing_type === 'combo' ? 'Combo' : 'Sale';
      lines.push({
        type: 'text',
        text: `  ${label}: Reg $${item.standard_price.toFixed(2)} — Save $${savings.toFixed(2)}!`,
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
  const date = new Date(tx.transaction_date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  // Build vehicle description for customer info section
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
    ${vehicleDesc ? `<tr>
      <td colspan="2" style="font-size:13px;color:#444;">${esc(vehicleDesc)}</td>
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

      case 'text':
        parts.push(...CMD_ALIGN_CENTER);
        parts.push(...textToBytes(line.text ?? ''));
        parts.push(LF);
        break;

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
