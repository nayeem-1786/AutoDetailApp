'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Loader2,
  Send,
  Edit3,
  Trash2,
  Calendar,
  Copy,
  Mail,
  MessageSquare,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { posFetch } from '../../lib/pos-fetch';
import { useQuote } from '../../context/quote-context';
import {
  STATUS_BADGE_CONFIG,
  formatQuoteDate,
  formatQuoteDateTime,
  formatCurrency,
} from './quote-helpers';
import { QuoteSendDialog } from './quote-send-dialog';
import { QuoteConvertDialog } from './quote-convert-dialog';
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
  valid_until: string | null;
  created_at: string;
  sent_at: string | null;
  updated_at: string;
  converted_appointment_id: string | null;
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
  }[];
}

interface Communication {
  id: string;
  channel: 'email' | 'sms';
  sent_to: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  created_at: string;
}

export function QuoteDetail({ quoteId, onBack, onEdit, onReQuote }: QuoteDetailProps) {
  const { dispatch: quoteDispatch } = useQuote();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
    quoteDispatch({ type: 'CLEAR_QUOTE' });
    onEdit(quoteId);
  }

  function handleReQuote() {
    // Clear quote state — builder will create new from this quote's data
    quoteDispatch({ type: 'CLEAR_QUOTE' });
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

  if (loading || !quote) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const badge = STATUS_BADGE_CONFIG[quote.status];
  const customerName = quote.customer
    ? `${quote.customer.first_name} ${quote.customer.last_name}`
    : 'No Customer';
  const vehicleStr = quote.vehicle
    ? `${quote.vehicle.year} ${quote.vehicle.make} ${quote.vehicle.model}${quote.vehicle.color ? ` (${quote.vehicle.color})` : ''}`
    : 'No Vehicle';

  // Calculate total duration from service items (estimate)
  const totalDurationMinutes = 60; // Default fallback

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Quotes
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-900">
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
          {/* Draft: Edit, Send, Convert, Delete */}
          {quote.status === 'draft' && (
            <>
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button size="sm" onClick={() => setSendDialogOpen(true)}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                Send
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConvertDialogOpen(true)}>
                <Calendar className="mr-1.5 h-3.5 w-3.5" />
                Book
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {/* Sent/Viewed: Edit, Resend, Convert */}
          {(quote.status === 'sent' || quote.status === 'viewed') && (
            <>
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button size="sm" onClick={() => setSendDialogOpen(true)}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                Resend
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConvertDialogOpen(true)}>
                <Calendar className="mr-1.5 h-3.5 w-3.5" />
                Book
              </Button>
            </>
          )}

          {/* Accepted: Convert, Edit */}
          {quote.status === 'accepted' && (
            <>
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button size="sm" onClick={() => setConvertDialogOpen(true)}>
                <Calendar className="mr-1.5 h-3.5 w-3.5" />
                Convert to Booking
              </Button>
            </>
          )}

          {/* Expired: Re-quote */}
          {quote.status === 'expired' && (
            <Button size="sm" onClick={handleReQuote}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Re-Quote
            </Button>
          )}

          {/* Converted: View appointment info */}
          {quote.status === 'converted' && quote.converted_appointment_id && (
            <div className="rounded-md bg-teal-50 px-3 py-1.5 text-sm text-teal-700">
              Converted to appointment
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Customer & Vehicle */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Customer
              </h3>
              <p className="text-sm font-medium text-gray-900">{customerName}</p>
              {quote.customer?.email && (
                <p className="mt-0.5 text-xs text-gray-500">{quote.customer.email}</p>
              )}
              {quote.customer?.phone && (
                <p className="mt-0.5 text-xs text-gray-500">{quote.customer.phone}</p>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Vehicle
              </h3>
              <p className="text-sm font-medium text-gray-900">{vehicleStr}</p>
            </div>
          </div>

          {/* Items */}
          <div className="rounded-lg border border-gray-200">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Services & Products
              </h3>
            </div>
            <div className="divide-y divide-gray-100">
              {quote.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                    {item.tier_name && (
                      <p className="text-xs text-gray-500">{item.tier_name}</p>
                    )}
                    {item.notes && (
                      <p className="text-xs text-gray-400 italic">{item.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500">x{item.quantity}</span>
                    <span className="font-medium tabular-nums text-gray-900">
                      {formatCurrency(item.total_price)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t border-gray-200 px-4 py-3 space-y-1">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(quote.subtotal)}</span>
              </div>
              {quote.tax_amount > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Tax</span>
                  <span className="tabular-nums">{formatCurrency(quote.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(quote.total_amount)}</span>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Details
            </h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-gray-500">Created</span>
              <span className="text-gray-900">{formatQuoteDateTime(quote.created_at)}</span>

              {quote.sent_at && (
                <>
                  <span className="text-gray-500">Last Contacted</span>
                  <span className="text-gray-900">{formatQuoteDateTime(quote.sent_at)}</span>
                </>
              )}

              {quote.valid_until && (
                <>
                  <span className="text-gray-500">Valid Until</span>
                  <span className="text-gray-900">{formatQuoteDate(quote.valid_until)}</span>
                </>
              )}

              <span className="text-gray-500">Last Updated</span>
              <span className="text-gray-900">{formatQuoteDateTime(quote.updated_at)}</span>
            </div>

            {quote.notes && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-500">Notes</p>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{quote.notes}</p>
              </div>
            )}
          </div>

          {/* Communication History */}
          {communications.length > 0 && (
            <div className="rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Communication History
                </h3>
              </div>
              <div className="divide-y divide-gray-100">
                {communications.map((comm) => (
                  <div key={comm.id} className="flex items-center gap-3 px-4 py-2.5">
                    {comm.channel === 'email' ? (
                      <Mail className="h-4 w-4 text-gray-400" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-gray-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 capitalize">
                          {comm.channel}
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                            comm.status === 'sent'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          )}
                        >
                          {comm.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{comm.sent_to}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3 w-3" />
                      {formatQuoteDateTime(comm.created_at)}
                    </div>
                  </div>
                ))}
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

      <QuoteConvertDialog
        open={convertDialogOpen}
        onClose={() => setConvertDialogOpen(false)}
        quoteId={quoteId}
        totalDurationMinutes={totalDurationMinutes}
        onConverted={handleConvertComplete}
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
