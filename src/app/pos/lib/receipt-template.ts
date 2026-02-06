import type { MergedReceiptConfig } from '@/lib/data/receipt-config';

interface ReceiptItem {
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tax_amount: number;
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
  customer?: { first_name: string; last_name: string; phone?: string | null } | null;
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
};

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

  // Custom text below header
  if (c.custom_text && c.custom_text_placement === 'below_header') {
    lines.push({ type: 'text', text: c.custom_text });
    lines.push({ type: 'divider' });
  }

  // Receipt number & date
  lines.push({
    type: 'columns',
    left: `Receipt #${tx.receipt_number || 'N/A'}`,
    right: new Date(tx.transaction_date).toLocaleDateString(),
  });

  // Customer (left) + Employee name (right) on same line
  const customerStr = tx.customer ? `Customer: ${tx.customer.first_name} ${tx.customer.last_name}` : '';
  const employeeStr = tx.employee ? tx.employee.first_name : '';
  if (customerStr || employeeStr) {
    lines.push({
      type: 'columns',
      left: customerStr,
      right: employeeStr,
    });
  }

  // Vehicle
  if (tx.vehicle) {
    const v = [tx.vehicle.year, tx.vehicle.make, tx.vehicle.model]
      .filter(Boolean)
      .join(' ');
    if (v) {
      lines.push({ type: 'text', text: `Vehicle: ${v}` });
    }
  }

  lines.push({ type: 'divider' });

  // Items layout:
  //   qty > 1: line 1 = item name (full width, wraps if long)
  //            line 2 = indented qty + price + TX
  //   qty = 1: single line = name + price + TX
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

  // Custom text above footer
  if (c.custom_text && c.custom_text_placement === 'above_footer') {
    lines.push({ type: 'spacer' });
    lines.push({ type: 'text', text: c.custom_text });
  }

  lines.push({ type: 'spacer' });
  lines.push({ type: 'text', text: 'Thank you for your business!' });

  // Custom text below footer
  if (c.custom_text && c.custom_text_placement === 'below_footer') {
    lines.push({ type: 'text', text: c.custom_text });
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

  const vehicleStr = tx.vehicle
    ? [tx.vehicle.year, tx.vehicle.make, tx.vehicle.model].filter(Boolean).join(' ')
    : '';

  const itemRows = tx.items
    .map((item) => {
      const txCell = item.tax_amount > 0 ? 'TX' : '';
      if (item.quantity > 1) {
        // Multi-qty: name on own row (full width), qty + price + TX on next row
        return `<tr>
          <td colspan="3" style="padding:4px 0 0;font-size:14px;">${esc(item.item_name)}</td>
        </tr>
        <tr>
          <td style="padding:0 0 4px 12px;font-size:13px;color:#444;">${item.quantity} x $${item.unit_price.toFixed(2)} each</td>
          <td style="padding:0 0 4px;font-size:14px;text-align:right;white-space:nowrap;">$${item.total_price.toFixed(2)}</td>
          <td style="padding:0 0 4px 8px;font-size:11px;color:#555;white-space:nowrap;width:20px;">${txCell}</td>
        </tr>`;
      }
      // Single qty: name + price + TX on one row
      return `<tr>
        <td style="padding:4px 0;font-size:14px;">${esc(item.item_name)}</td>
        <td style="padding:4px 0;font-size:14px;text-align:right;white-space:nowrap;">$${item.total_price.toFixed(2)}</td>
        <td style="padding:4px 0 4px 8px;font-size:11px;color:#555;white-space:nowrap;width:20px;">${txCell}</td>
      </tr>`;
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

  // Build logo HTML — placed outside the centered header div when needed,
  // so we use explicit text-align to control horizontal position.
  const logoAlign = c.logo_alignment || 'center';
  const logoHtml = c.logo_url
    ? `<div style="text-align:${logoAlign};margin:8px 0;"><img src="${esc(c.logo_url)}" alt="" style="display:inline-block;width:${c.logo_width}px;max-width:100%;height:auto;" /></div>`
    : '';

  // Contact lines — wrapped in <a> tags with explicit color to prevent
  // email clients from auto-linking as blue text (invisible on dark mode)
  const linkStyle = 'color:#444444;text-decoration:none;';
  const emailLine = c.email ? `<div style="font-size:13px;"><a href="mailto:${esc(c.email)}" style="${linkStyle}">${esc(c.email)}</a></div>` : '';
  const websiteLine = c.website ? `<div style="font-size:13px;"><a href="${esc(c.website)}" style="${linkStyle}">${esc(c.website)}</a></div>` : '';

  // Custom text HTML
  const customTextHtml = c.custom_text
    ? `<div style="text-align:center;font-size:13px;color:#333;margin:8px 0;white-space:pre-wrap;">${esc(c.custom_text)}</div>`
    : '';

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

  ${c.custom_text && c.custom_text_placement === 'below_header' ? customTextHtml + '<hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">' : ''}

  <!-- Receipt info -->
  <table style="width:100%;font-size:14px;margin-bottom:4px;">
    <tr>
      <td>Receipt #${esc(tx.receipt_number || 'N/A')}</td>
      <td style="text-align:right;">${esc(date)}</td>
    </tr>
  </table>

  ${tx.customer || tx.employee ? `<table style="width:100%;font-size:14px;"><tr>
      <td>${tx.customer ? `Customer: ${esc(tx.customer.first_name)} ${esc(tx.customer.last_name)}` : ''}</td>
      <td style="text-align:right;">${tx.employee ? esc(tx.employee.first_name) : ''}</td>
    </tr></table>` : ''}
  ${vehicleStr ? `<div style="font-size:14px;">Vehicle: ${esc(vehicleStr)}</div>` : ''}

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
  ${c.custom_text && c.custom_text_placement === 'above_footer' ? customTextHtml : ''}

  <!-- Footer -->
  <div style="text-align:center;margin-top:20px;font-size:14px;color:#333;">
    Thank you for your business!
  </div>

  ${c.custom_text && c.custom_text_placement === 'below_footer' ? customTextHtml : ''}
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
