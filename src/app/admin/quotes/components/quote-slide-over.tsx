'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SlideOver } from '@/components/ui/slide-over';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatCurrency, formatDate, formatDateTime, formatPhone } from '@/lib/utils/format';
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_BADGE_VARIANT } from '@/lib/utils/constants';
import type { Quote, QuoteItem, Customer, Vehicle } from '@/lib/supabase/types';

interface QuoteSlideOverProps {
  quoteId: string | null;
  open: boolean;
  onClose: () => void;
}

type QuoteDetail = Quote & {
  customer?: Customer | null;
  vehicle?: Vehicle | null;
  items?: QuoteItem[];
};

export function QuoteSlideOver({ quoteId, open, onClose }: QuoteSlideOverProps) {
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!quoteId || !open) {
      setQuote(null);
      setError(false);
      return;
    }

    let cancelled = false;

    async function fetchQuote() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/quotes/${quoteId}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (!cancelled) {
          setQuote(data.quote ?? data);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchQuote();
    return () => {
      cancelled = true;
    };
  }, [quoteId, open]);

  const vehicleLabel = quote?.vehicle
    ? [quote.vehicle.year, quote.vehicle.make, quote.vehicle.model].filter(Boolean).join(' ') || '--'
    : '--';

  return (
    <SlideOver open={open} onClose={onClose} title={quote ? `Quote ${quote.quote_number}` : 'Quote Detail'} width="2xl">
      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-gray-500">Quote not found</p>
        </div>
      )}

      {/* Content */}
      {!loading && !error && quote && (
        <div className="space-y-6">
          {/* Header: Quote number + Status */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{quote.quote_number}</h3>
            <Badge variant={QUOTE_STATUS_BADGE_VARIANT[quote.status] ?? 'default'}>
              {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
            </Badge>
          </div>

          {/* Customer card */}
          {quote.customer && (
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Customer</p>
              <p className="font-medium text-gray-900">
                {quote.customer.first_name} {quote.customer.last_name}
              </p>
              {quote.customer.email && (
                <p className="text-sm text-gray-500">{quote.customer.email}</p>
              )}
              {quote.customer.phone && (
                <p className="text-sm text-gray-500">{formatPhone(quote.customer.phone)}</p>
              )}
              <Link
                href={`/admin/customers/${quote.customer.id}`}
                className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                View customer profile
              </Link>
            </div>
          )}

          {/* Vehicle card */}
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Vehicle</p>
            <p className="text-sm text-gray-900">{vehicleLabel}</p>
          </div>

          {/* Items section */}
          {quote.items && quote.items.length > 0 && (
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase text-gray-500 mb-3">Services</p>
              <div className="space-y-2">
                {quote.items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-gray-900">{item.item_name}</p>
                      {item.tier_name && (
                        <p className="text-xs text-gray-500">({item.tier_name})</p>
                      )}
                    </div>
                    <p className="text-sm font-medium tabular-nums text-gray-900">
                      {formatCurrency(item.total_price)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-semibold uppercase text-gray-500 mb-3">Totals</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="tabular-nums text-gray-700">{formatCurrency(quote.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tax</span>
                <span className="tabular-nums text-gray-700">{formatCurrency(quote.tax_amount)}</span>
              </div>
              <div className="border-t border-gray-200 pt-1.5">
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="font-semibold tabular-nums text-gray-900">
                    {formatCurrency(quote.total_amount)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-semibold uppercase text-gray-500 mb-3">Details</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-700">{formatDate(quote.created_at)}</span>
              </div>
              {quote.valid_until && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Valid until</span>
                  <span className="text-gray-700">{formatDate(quote.valid_until)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Last contacted</span>
                <span className="text-gray-700">
                  {quote.sent_at ? formatDateTime(quote.sent_at) : 'Never'}
                </span>
              </div>
            </div>
            {quote.notes && (
              <div className="mt-3 border-t border-gray-200 pt-3">
                <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-600">{quote.notes}</p>
              </div>
            )}
          </div>

          {/* Footer: Open in POS */}
          <div className="sticky bottom-0 border-t border-gray-200 bg-white pt-4 -mx-6 px-6 -mb-6 pb-6">
            <Button
              className="w-full"
              onClick={() =>
                window.open(`/pos/quotes?mode=detail&quoteId=${quoteId}`, '_blank')
              }
            >
              Open in POS
            </Button>
          </div>
        </div>
      )}
    </SlideOver>
  );
}
