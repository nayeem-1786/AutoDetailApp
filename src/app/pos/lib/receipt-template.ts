import { BUSINESS } from '@/lib/utils/constants';
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
  right?: string;
  url?: string;
  width?: number;
  alignment?: 'left' | 'center' | 'right';
}

// Hardcoded fallback when no config is passed (backwards compatibility)
const FALLBACK_CONFIG: MergedReceiptConfig = {
  name: BUSINESS.NAME,
  phone: BUSINESS.PHONE.replace('+1', '(').replace(/(\d{3})(\d{3})(\d{4})/, '$1) $2-$3'),
  address: BUSINESS.ADDRESS,
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

  // Cashier
  if (tx.employee) {
    lines.push({
      type: 'text',
      text: `Cashier: ${tx.employee.first_name} ${tx.employee.last_name}`,
    });
  }

  // Customer
  if (tx.customer) {
    lines.push({
      type: 'text',
      text: `Customer: ${tx.customer.first_name} ${tx.customer.last_name}`,
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

  // Items
  for (const item of tx.items) {
    lines.push({
      type: 'columns',
      left: `${item.item_name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`,
      right: `$${item.total_price.toFixed(2)}`,
    });
    if (item.tax_amount > 0) {
      lines.push({
        type: 'columns',
        left: '  Tax',
        right: `$${item.tax_amount.toFixed(2)}`,
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
    lines.push({
      type: 'columns',
      left: 'Discount',
      right: `-$${tx.discount_amount.toFixed(2)}`,
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
          const right = line.right ?? '';
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
      const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
      const taxNote = item.tax_amount > 0
        ? `<div style="font-size:11px;color:#888;padding-left:12px;">Tax: $${item.tax_amount.toFixed(2)}</div>`
        : '';
      return `<tr>
        <td style="padding:4px 0;font-size:13px;">${esc(item.item_name)}${qty}</td>
        <td style="padding:4px 0;font-size:13px;text-align:right;">$${item.total_price.toFixed(2)}</td>
      </tr>
      ${taxNote ? `<tr><td colspan="2">${taxNote}</td></tr>` : ''}`;
    })
    .join('');

  const totals: string[] = [];
  totals.push(row('Subtotal', `$${tx.subtotal.toFixed(2)}`));
  if (tx.tax_amount > 0) totals.push(row('Tax', `$${tx.tax_amount.toFixed(2)}`));
  if (tx.discount_amount > 0) totals.push(row('Discount', `-$${tx.discount_amount.toFixed(2)}`, '#16a34a'));
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

  // Contact lines
  const emailLine = c.email ? `<div style="font-size:12px;color:#666;">${esc(c.email)}</div>` : '';
  const websiteLine = c.website ? `<div style="font-size:12px;color:#666;">${esc(c.website)}</div>` : '';

  // Custom text HTML
  const customTextHtml = c.custom_text
    ? `<div style="text-align:center;font-size:11px;color:#888;margin:8px 0;white-space:pre-wrap;">${esc(c.custom_text)}</div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f5f5f5;font-family:'Courier New',Courier,monospace;">
<div style="max-width:400px;margin:0 auto;background:#fff;border:1px solid #ddd;padding:24px 20px;">
  <!-- Header -->
  ${c.logo_placement === 'above_name' ? logoHtml : ''}
  <div style="text-align:center;margin-bottom:16px;">
    <div style="font-size:18px;font-weight:bold;letter-spacing:1px;">${esc(c.name)}</div>
    ${c.logo_placement === 'below_name' ? logoHtml : ''}
    <div style="font-size:12px;color:#666;margin-top:4px;">${esc(c.address)}</div>
    <div style="font-size:12px;color:#666;">${esc(c.phone)}</div>
    ${emailLine}
    ${websiteLine}
  </div>

  <hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">

  ${c.custom_text && c.custom_text_placement === 'below_header' ? customTextHtml + '<hr style="border:none;border-top:1px dashed #ccc;margin:12px 0;">' : ''}

  <!-- Receipt info -->
  <table style="width:100%;font-size:13px;margin-bottom:4px;">
    <tr>
      <td>Receipt #${esc(tx.receipt_number || 'N/A')}</td>
      <td style="text-align:right;">${esc(date)}</td>
    </tr>
  </table>

  ${tx.employee ? `<div style="font-size:13px;">Cashier: ${esc(tx.employee.first_name)} ${esc(tx.employee.last_name)}</div>` : ''}
  ${tx.customer ? `<div style="font-size:13px;">Customer: ${esc(tx.customer.first_name)} ${esc(tx.customer.last_name)}</div>` : ''}
  ${vehicleStr ? `<div style="font-size:13px;">Vehicle: ${esc(vehicleStr)}</div>` : ''}

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
  <div style="font-size:12px;color:#666;margin-bottom:4px;">Payment</div>
  <table style="width:100%;border-collapse:collapse;">
    ${paymentRows}
  </table>

  ${c.logo_placement === 'above_footer' ? logoHtml : ''}
  ${c.custom_text && c.custom_text_placement === 'above_footer' ? customTextHtml : ''}

  <!-- Footer -->
  <div style="text-align:center;margin-top:20px;font-size:13px;color:#666;">
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
    <td style="padding:3px 0;font-size:13px${style}">${left}</td>
    <td style="padding:3px 0;font-size:13px;text-align:right${style}">${right}</td>
  </tr>`;
}
