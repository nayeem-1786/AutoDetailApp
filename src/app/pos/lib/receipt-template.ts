import { BUSINESS } from '@/lib/utils/constants';

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

interface ReceiptTransaction {
  receipt_number: string | null;
  transaction_date: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  tip_amount: number;
  total_amount: number;
  customer?: { first_name: string; last_name: string; phone?: string | null } | null;
  vehicle?: { year?: number | null; make?: string | null; model?: string | null; color?: string | null } | null;
  items: ReceiptItem[];
  payments: ReceiptPayment[];
}

export interface ReceiptLine {
  type: 'header' | 'text' | 'bold' | 'divider' | 'columns' | 'spacer';
  text?: string;
  left?: string;
  right?: string;
}

/**
 * Generate a structured receipt from transaction data.
 * This can be used by Star WebPRNT or formatted as plain text.
 */
export function generateReceiptLines(tx: ReceiptTransaction): ReceiptLine[] {
  const lines: ReceiptLine[] = [];

  // Header
  lines.push({ type: 'header', text: BUSINESS.NAME });
  lines.push({ type: 'text', text: BUSINESS.ADDRESS });
  lines.push({ type: 'text', text: BUSINESS.PHONE.replace('+1', '(').replace(/(\d{3})(\d{3})(\d{4})/, '$1) $2-$3') });
  lines.push({ type: 'divider' });

  // Receipt number & date
  lines.push({
    type: 'columns',
    left: `Receipt #${tx.receipt_number || 'N/A'}`,
    right: new Date(tx.transaction_date).toLocaleDateString(),
  });

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

  lines.push({ type: 'spacer' });
  lines.push({ type: 'text', text: 'Thank you for your business!' });
  lines.push({ type: 'spacer' });

  return lines;
}

/**
 * Convert receipt lines to plain text for display or fallback.
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
