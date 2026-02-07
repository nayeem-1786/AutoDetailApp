import type { QuoteStatus } from '../../types';

export const STATUS_BADGE_CONFIG: Record<QuoteStatus, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-700' },
  sent: { label: 'Sent', bg: 'bg-blue-100', text: 'text-blue-700' },
  viewed: { label: 'Viewed', bg: 'bg-purple-100', text: 'text-purple-700' },
  accepted: { label: 'Accepted', bg: 'bg-green-100', text: 'text-green-700' },
  expired: { label: 'Expired', bg: 'bg-red-100', text: 'text-red-700' },
  converted: { label: 'Converted', bg: 'bg-teal-100', text: 'text-teal-700' },
};

export function formatQuoteDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatQuoteDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
