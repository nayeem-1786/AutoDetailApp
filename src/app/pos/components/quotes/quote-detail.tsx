'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Loader2,
  Send,
  Edit3,
  Trash2,
  ArrowRightCircle,
  Copy,
  Mail,
  MessageSquare,
  Clock,
  Briefcase,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { cleanVehicleDescription, sanitizeVehicleField } from '@/lib/utils/vehicle-helpers';
import { composeLineItems } from '@/lib/utils/compose-line-items';
import { renderTierToken } from '@/lib/quotes/tier-display';
import { resolveQuoteModifierRows } from '@/lib/quotes/modifier-display';
import {
  getLineItemPricingInfo,
  sumLineItemSavings,
  computePreDiscountSubtotal,
} from '@/lib/quotes/line-item-pricing';
import {
  deriveCommPillState,
  type CommPillTone,
} from '@/lib/quotes/derive-comm-pill';
import {
  buildQuoteNotesDisplay,
  type QuoteSource,
} from '@/lib/quotes/source-labels';
import { useRouter } from 'next/navigation';
import { formatPhone } from '@/lib/utils/format';
import { posFetch } from '../../lib/pos-fetch';
import { useQuote } from '../../context/quote-context';
import { usePosPermission } from '../../context/pos-permission-context';
import {
  STATUS_BADGE_CONFIG,
  formatQuoteDate,
  formatQuoteDateTime,
  formatCurrency,
} from './quote-helpers';
import { QuoteSendDialog } from './quote-send-dialog';
import { QuoteBookDialog } from '@/components/quotes/quote-book-dialog';
import { QuoteDeleteDialog } from './quote-delete-dialog';
import type { QuoteStatus } from '../../types';

interface QuoteDetailProps {
  quoteId: string;
  onBack: () => void;
  onEdit: (quoteId: string) => void;
  onReQuote: (quoteId: string) => void;
}

interface QuoteData {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  // Phase Quote-Source-1 — channel of origin; drives the auto-label
  // in the Notes section. NULL on pre-migration quotes.
  source: QuoteSource | null;
  valid_until: string | null;
  created_at: string;
  sent_at: string | null;
  updated_at: string;
  converted_appointment_id: string | null;
  // Phase Mobile-1.8: surface mobile-fee metadata so composeLineItems
  // can append the synthetic mobile-fee row to the services list. The
  // POS quotes GET endpoint already returns these via `SELECT *`; the
  // type widening matches the admin slide-over.
  is_mobile?: boolean;
  mobile_surcharge?: number | string | null;
  mobile_zone_name_snapshot?: string | null;
  // Item 15g Layer 15g-v — modifier columns drive the coupon / loyalty /
  // manual-discount rows in the saved-quote review surface. The POS
  // quotes GET endpoint returns these via `SELECT *`.
  coupon_code?: string | null;
  coupon_discount?: number | string | null;
  loyalty_points_to_redeem?: number | null;
  loyalty_discount?: number | string | null;
  manual_discount_type?: 'dollar' | 'percent' | null;
  manual_discount_value?: number | string | null;
  manual_discount_label?: string | null;
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  vehicle: {
    id: string;
    year: number;
    make: string;
    model: string;
    color: string | null;
  } | null;
  items: {
    id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    tier_name: string | null;
    notes: string | null;
    service_id: string | null;
    product_id: string | null;
    // Issue 33 follow-up UX: surface combo/sale fields so the line-row
    // strikethrough viz and "You saved" totals row can render.
    standard_price: number | null;
    pricing_type: 'standard' | 'sale' | 'combo' | null;
    // D46 (Issue 41): operator-curated tier presentation fields merged
    // in by getQuoteById → attachTierMetaToItems on the API server.
    tier_label?: string | null;
    qty_label?: string | null;
  }[];
}

interface Communication {
  id: string;
  channel: 'email' | 'sms';
  sent_to: string | null;
  // Phase Messaging-1+2: 3-status enum at send time. delivery_* fields
  // come from the JOIN to sms_delivery_log and reflect Twilio's webhook.
  status: 'sent' | 'failed' | 'blocked';
  error_message: string | null;
  created_at: string;
  twilio_sid: string | null;
  delivery_status: string | null;
  delivery_error_code: string | null;
  delivery_updated_at: string | null;
}

const PILL_TONE_CLASSES: Record<CommPillTone, string> = {
  green: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  yellow: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
  red: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  orange: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
};

export function QuoteDetail({ quoteId, onBack, onEdit, onReQuote }: QuoteDetailProps) {
  const router = useRouter();
  const { dispatch: quoteDispatch, quoteValidityDays } = useQuote();
  const { granted: canManageJobs } = usePosPermission('pos.jobs.manage');
  const { granted: canCreateQuote } = usePosPermission('quotes.create');
  const { granted: canSendQuote } = usePosPermission('quotes.send');
  const { granted: canConvertQuote } = usePosPermission('quotes.convert');
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);

  const fetchQuote = useCallback(async () => {
    try {
      const [quoteRes, commsRes] = await Promise.all([
        posFetch(`/api/pos/quotes/${quoteId}`),
        posFetch(`/api/pos/quotes/${quoteId}/communications`),
      ]);

      if (quoteRes.ok) {
        const data = await quoteRes.json();
        setQuote(data.quote);
      }

      if (commsRes.ok) {
        const data = await commsRes.json();
        setCommunications(data.communications || []);
      }
    } catch {
      toast.error('Failed to load quote');
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  function handleEdit() {
    // Clear quote state before editing to force fresh load
    quoteDispatch({ type: 'CLEAR_QUOTE', validityDays: quoteValidityDays });
    onEdit(quoteId);
  }

  function handleReQuote() {
    // Clear quote state — builder will create new from this quote's data
    quoteDispatch({ type: 'CLEAR_QUOTE', validityDays: quoteValidityDays });
    onReQuote(quoteId);
  }

  function handleSendComplete() {
    setSendDialogOpen(false);
    fetchQuote(); // Refresh
  }

  function handleConvertComplete() {
    setConvertDialogOpen(false);
    fetchQuote(); // Refresh
  }

  function handleDeleteComplete() {
    setDeleteDialogOpen(false);
    onBack();
  }

  async function handleCreateJobFromQuote() {
    if (!quote || !quote.customer) {
      toast.error('Quote must have a customer to create a job');
      return;
    }

    const serviceItems = quote.items.filter((item) => item.service_id);
    if (serviceItems.length === 0) {
      toast.error('Quote must have at least one service to create a job');
      return;
    }

    setCreatingJob(true);
    try {
      // Map quote items to job services
      const jobServices = serviceItems.map((item) => ({
        id: item.service_id,
        name: item.item_name,
        price: item.total_price,
        quantity: item.quantity,
        tier_name: item.tier_name,
      }));

      // Create the job
      const jobRes = await posFetch('/api/pos/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: quote.customer.id,
          vehicle_id: quote.vehicle?.id || null,
          services: jobServices,
          quote_id: quote.id,
          notes: quote.notes || undefined,
        }),
      });

      if (!jobRes.ok) {
        const data = await jobRes.json();
        throw new Error(data.error || 'Failed to create job');
      }

      // Update quote status to converted
      await posFetch(`/api/pos/quotes/${quote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'converted' }),
      });

      // Notify about products
      const productItems = quote.items.filter((item) => item.product_id);
      if (productItems.length > 0) {
        toast.info('Products will be added at checkout', { duration: 4000 });
      }

      toast.success(`Job created from quote #${quote.quote_number}`);
      router.push('/pos/jobs');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setCreatingJob(false);
    }
  }

  // Calculate total duration from service items (hooks must be before early returns)
  const [serviceDurations, setServiceDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!quote?.items) return;
    const serviceIds = quote.items
      .filter((item) => item.service_id)
      .map((item) => item.service_id as string);
    if (serviceIds.length === 0) return;

    posFetch(`/api/pos/services/durations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_ids: serviceIds }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setServiceDurations(data.durations || {});
        }
      })
      .catch(() => {});
  }, [quote?.items]);

  const totalDurationMinutes = useMemo(() => {
    if (!quote?.items) return 60;
    const total = quote.items.reduce((sum, item) => {
      if (item.service_id && serviceDurations[item.service_id]) {
        return sum + serviceDurations[item.service_id];
      }
      return sum;
    }, 0);
    return total > 0 ? total : 60;
  }, [quote?.items, serviceDurations]);

  if (loading || !quote) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  const badge = STATUS_BADGE_CONFIG[quote.status];
  const customerName = quote.customer
    ? `${quote.customer.first_name} ${quote.customer.last_name}`
    : 'No Customer';
  const vehicleStr = quote.vehicle
    ? `${cleanVehicleDescription({ year: quote.vehicle.year, make: quote.vehicle.make, model: quote.vehicle.model })}${sanitizeVehicleField(quote.vehicle.color) ? ` (${quote.vehicle.color})` : ''}`
    : 'No Vehicle';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Quotes
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {quote.quote_number}
            </h1>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                badge.bg,
                badge.text
              )}
            >
              {badge.label}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Draft: Edit, Send, Convert, Create Job, Delete */}
          {quote.status === 'draft' && (
            <>
              {canCreateQuote && (
                <Button variant="outline" size="sm" onClick={handleEdit}>
                  <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              {canSendQuote && (
                <Button size="sm" onClick={() => setSendDialogOpen(true)}>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Send
                </Button>
              )}
              {canConvertQuote && (
                <Button variant="outline" size="sm" onClick={() => setConvertDialogOpen(true)}>
                  <ArrowRightCircle className="mr-1.5 h-3.5 w-3.5" />
                  Convert to Appointment
                </Button>
              )}
              {canManageJobs && quote.customer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateJobFromQuote}
                  disabled={creatingJob}
                >
                  {creatingJob ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Briefcase className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Create Job
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {/* Sent/Viewed: Edit, Resend, Convert, Create Job */}
          {(quote.status === 'sent' || quote.status === 'viewed') && (
            <>
              {canCreateQuote && (
                <Button variant="outline" size="sm" onClick={handleEdit}>
                  <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              {canSendQuote && (
                <Button size="sm" onClick={() => setSendDialogOpen(true)}>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Resend
                </Button>
              )}
              {canConvertQuote && (
                <Button variant="outline" size="sm" onClick={() => setConvertDialogOpen(true)}>
                  <ArrowRightCircle className="mr-1.5 h-3.5 w-3.5" />
                  Convert to Appointment
                </Button>
              )}
              {canManageJobs && quote.customer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateJobFromQuote}
                  disabled={creatingJob}
                >
                  {creatingJob ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Briefcase className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Create Job
                </Button>
              )}
            </>
          )}

          {/* Accepted: Convert, Edit, Create Job */}
          {quote.status === 'accepted' && (
            <>
              {canCreateQuote && (
                <Button variant="outline" size="sm" onClick={handleEdit}>
                  <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              {canConvertQuote && (
                <Button size="sm" onClick={() => setConvertDialogOpen(true)}>
                  <ArrowRightCircle className="mr-1.5 h-3.5 w-3.5" />
                  Convert to Appointment
                </Button>
              )}
              {canManageJobs && quote.customer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateJobFromQuote}
                  disabled={creatingJob}
                >
                  {creatingJob ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Briefcase className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Create Job
                </Button>
              )}
            </>
          )}

          {/* Expired: Re-quote */}
          {quote.status === 'expired' && canCreateQuote && (
            <Button size="sm" onClick={handleReQuote}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Re-Quote
            </Button>
          )}

          {/* Converted: View conversion info */}
          {quote.status === 'converted' && (
            <div className="rounded-md bg-teal-50 px-3 py-1.5 text-sm text-teal-700">
              {quote.converted_appointment_id ? 'Converted to appointment' : 'Converted to job'}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Customer & Vehicle */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Customer
              </h3>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{customerName}</p>
              {quote.customer?.email && (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{quote.customer.email}</p>
              )}
              {quote.customer?.phone && (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{formatPhone(quote.customer.phone) || quote.customer.phone}</p>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Vehicle
              </h3>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{vehicleStr}</p>
            </div>
          </div>

          {/* Items — Phase Mobile-1.8: route through composeLineItems so
              the synthetic mobile-fee row is appended at end on mobile
              quotes. This surface was missed in Phase 1.7 audit; pattern
              mirrors src/app/admin/quotes/components/quote-slide-over.tsx. */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Services & Products
              </h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {composeLineItems(
                {
                  is_mobile: quote.is_mobile ?? false,
                  mobile_surcharge: quote.mobile_surcharge ?? 0,
                  mobile_zone_name_snapshot: quote.mobile_zone_name_snapshot ?? null,
                },
                quote.items || []
              ).map((item, idx) => {
                const sourceItem = item.is_mobile_fee ? null : quote.items[idx];
                const rowKey = item.is_mobile_fee
                  ? `mobile-fee-${idx}`
                  : (sourceItem?.id ?? `item-${idx}`);
                // Issue 33 follow-up UX: full strikethrough viz to match the
                // customer-facing quote page (operator preparing the quote
                // should see exactly what the customer sees).
                const pricingInfo = sourceItem
                  ? getLineItemPricingInfo({
                      unit_price: sourceItem.unit_price,
                      standard_price: sourceItem.standard_price ?? null,
                      pricing_type: sourceItem.pricing_type ?? null,
                      quantity: sourceItem.quantity,
                    })
                  : null;
                return (
                  <div key={rowKey} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
                      {(() => {
                        // D46 (Issue 41): unified tier rendering. tier_label
                        // / qty_label arrive on item via composeLineItems'
                        // widened DisplayLineItem (raw input enriched by
                        // getQuoteById → attachTierMetaToItems server-side).
                        const tierToken = renderTierToken({
                          tier_name: item.tier_name ?? null,
                          tier_label: item.tier_label,
                          qty_label: item.qty_label,
                          quantity: item.quantity,
                        });
                        return tierToken ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{tierToken}</p>
                        ) : null;
                      })()}
                      {pricingInfo?.hasDiscount && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                          {pricingInfo.label}: Reg{' '}
                          {formatCurrency(pricingInfo.standardPrice as number)} | Saved{' '}
                          {formatCurrency(pricingInfo.savingsPerUnit)}!
                        </p>
                      )}
                      {sourceItem?.notes && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic">{sourceItem.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-500 dark:text-gray-400">x{item.quantity}</span>
                      {pricingInfo?.hasDiscount ? (
                        <div className="text-right">
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 line-through">
                            {formatCurrency(pricingInfo.standardPrice as number)}
                          </div>
                          <div className="font-medium tabular-nums text-green-600 dark:text-green-400">
                            {formatCurrency(item.total_price)}
                          </div>
                        </div>
                      ) : (
                        <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">
                          {formatCurrency(item.total_price)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-1">
              {(() => {
                // Pre-discount subtotal pattern (post-Q-0084 math fix).
                const preDiscountSubtotal = computePreDiscountSubtotal(
                  (quote.items || []).map((i) => ({
                    unit_price: i.unit_price,
                    standard_price: i.standard_price ?? null,
                    pricing_type: i.pricing_type ?? null,
                    quantity: i.quantity,
                  })),
                );
                return (
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatCurrency(preDiscountSubtotal)}</span>
                  </div>
                );
              })()}
              {quote.tax_amount > 0 && (
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Tax</span>
                  <span className="tabular-nums">{formatCurrency(quote.tax_amount)}</span>
                </div>
              )}
              {(() => {
                // Issue 33 follow-up UX (operator Q1): "You saved" row above
                // any modifier rows + Total. Hidden when zero.
                const totalSavings = sumLineItemSavings(
                  (quote.items || []).map((i) => ({
                    unit_price: i.unit_price,
                    standard_price: i.standard_price ?? null,
                    pricing_type: i.pricing_type ?? null,
                    quantity: i.quantity,
                  })),
                );
                return totalSavings > 0 ? (
                  <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                    <span>You saved</span>
                    <span className="tabular-nums">-{formatCurrency(totalSavings)}</span>
                  </div>
                ) : null;
              })()}
              {/* Item 15g Layer 15g-v: coupon / loyalty / manual modifier
                  rows between Tax and Total. Conditional per modifier;
                  green styling matches operator UI <QuoteTotals> intent
                  (savings to customer). */}
              {resolveQuoteModifierRows(quote).map((row) => (
                <div
                  key={row.kind}
                  className="flex justify-between text-sm text-green-600 dark:text-green-400"
                >
                  <span>{row.label}</span>
                  <span className="tabular-nums">-{formatCurrency(row.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(quote.total_amount)}</span>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Details
            </h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Created</span>
              <span className="text-gray-900 dark:text-gray-100">{formatQuoteDateTime(quote.created_at)}</span>

              {quote.sent_at && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Last Contacted</span>
                  <span className="text-gray-900 dark:text-gray-100">{formatQuoteDateTime(quote.sent_at)}</span>
                </>
              )}

              {quote.valid_until && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Valid Until</span>
                  <span className="text-gray-900 dark:text-gray-100">{formatQuoteDate(quote.valid_until)}</span>
                </>
              )}

              <span className="text-gray-500 dark:text-gray-400">Last Updated</span>
              <span className="text-gray-900 dark:text-gray-100">{formatQuoteDateTime(quote.updated_at)}</span>
            </div>

            {(() => {
              const notesDisplay = buildQuoteNotesDisplay(quote.source, quote.notes);
              if (!notesDisplay) return null;
              return (
                <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Notes</p>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{notesDisplay}</p>
                </div>
              );
            })()}
          </div>

          {/* Communication History */}
          {communications.length > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Communication History
                </h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {communications.map((comm) => {
                  const pill = deriveCommPillState(comm);
                  return (
                    <div key={comm.id} className="flex items-center gap-3 px-4 py-2.5">
                      {comm.channel === 'email' ? (
                        <Mail className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                            {comm.channel}
                          </span>
                          <span
                            className={cn(
                              'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                              PILL_TONE_CLASSES[pill.tone]
                            )}
                            title={pill.detail ?? undefined}
                          >
                            {pill.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {comm.sent_to ? (formatPhone(comm.sent_to) || comm.sent_to) : '—'}
                        </p>
                        {pill.detail && (
                          <p className="text-xs text-red-500 dark:text-red-400">{pill.detail}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                        <Clock className="h-3 w-3" />
                        {formatQuoteDateTime(comm.created_at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <QuoteSendDialog
        open={sendDialogOpen}
        onClose={() => setSendDialogOpen(false)}
        quoteId={quoteId}
        customerEmail={quote.customer?.email ?? null}
        customerPhone={quote.customer?.phone ?? null}
        onSent={handleSendComplete}
      />

      <QuoteBookDialog
        open={convertDialogOpen}
        onClose={() => setConvertDialogOpen(false)}
        quoteId={quoteId}
        defaultDuration={totalDurationMinutes}
        fetchFn={posFetch}
        apiBasePath="/api/pos/quotes"
        customerEmail={quote.customer?.email ?? null}
        customerPhone={quote.customer?.phone ?? null}
        onBooked={handleConvertComplete}
      />

      {quote.status === 'draft' && (
        <QuoteDeleteDialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          quoteId={quoteId}
          quoteNumber={quote.quote_number}
          onDeleted={handleDeleteComplete}
        />
      )}
    </div>
  );
}
