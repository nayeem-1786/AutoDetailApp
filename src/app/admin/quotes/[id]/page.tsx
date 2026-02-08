'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Quote, QuoteItem, Customer } from '@/lib/supabase/types';
import { formatCurrency, formatDate, formatDateTime, formatPhone } from '@/lib/utils/format';
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_BADGE_VARIANT } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, Car, Mail, MessageSquare, User, Calendar, DollarSign, Award, Clock, ExternalLink, Eye } from 'lucide-react';
import Link from 'next/link';

type QuoteWithRelations = Quote & {
  customer?: Customer | null;
  vehicle?: { id: string; year: number | null; make: string | null; model: string | null } | null;
  items?: QuoteItem[];
};


export default function QuoteDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();

  const [quote, setQuote] = useState<QuoteWithRelations | null>(null);
  const [loading, setLoading] = useState(true);

  // Communication history
  const [communications, setCommunications] = useState<{
    id: string;
    channel: 'email' | 'sms';
    sent_to: string;
    status: 'sent' | 'failed';
    error_message: string | null;
    created_at: string;
  }[]>([]);

  // Customer stats
  const [customerStats, setCustomerStats] = useState<{
    visitCount: number;
    lifetimeSpend: number;
    loyaltyPoints: number;
    lastVisit: string | null;
    memberSince: string | null;
  } | null>(null);

  const loadQuote = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('quotes')
      .select(
        `
        *,
        customer:customers(*),
        vehicle:vehicles(*),
        items:quote_items(*)
      `
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      console.error('Error loading quote:', error);
      setLoading(false);
      return;
    }

    const q = data as QuoteWithRelations;
    setQuote(q);

    // Load communication history
    const { data: commData, error: commErr } = await supabase
      .from('quote_communications')
      .select('*')
      .eq('quote_id', id)
      .order('created_at', { ascending: false });
    if (commErr) console.error('Failed to load communications:', commErr.message);
    if (commData) setCommunications(commData);

    // Load customer stats if customer exists
    if (q.customer_id) {
      const { data: txData } = await supabase
        .from('transactions')
        .select('total_amount, created_at')
        .eq('customer_id', q.customer_id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      const transactions = txData || [];
      const loyaltyPoints = (q.customer as Customer | null)?.loyalty_points_balance ?? 0;
      const lifetimeSpend = transactions.reduce((sum: number, tx: { total_amount: number | null }) => sum + (tx.total_amount || 0), 0);

      setCustomerStats({
        visitCount: transactions.length,
        lifetimeSpend,
        loyaltyPoints,
        lastVisit: transactions[0]?.created_at || null,
        memberSince: q.customer?.created_at || null,
      });
    }

    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    loadQuote();
  }, [loadQuote]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="space-y-6">
        <PageHeader title="Quote Not Found" />
        <p className="text-sm text-gray-500">The quote you are looking for does not exist.</p>
        <Button variant="outline" onClick={() => router.push('/admin/quotes')}>
          Back to Quotes
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Quote ${quote.quote_number}`}
        action={
          <div className="flex items-center gap-3">
            <Badge variant={QUOTE_STATUS_BADGE_VARIANT[quote.status]}>
              {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
            </Badge>
            <a href={`/pos/quotes?mode=builder&quoteId=${id}`} target="_blank" rel="noopener noreferrer">
              <Button>
                <ExternalLink className="h-4 w-4" />
                Edit in POS
              </Button>
            </a>
            <a href={`/pos/quotes?mode=detail&quoteId=${id}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">
                <Eye className="h-4 w-4" />
                View in POS
              </Button>
            </a>
            <Button variant="outline" onClick={() => router.push('/admin/quotes')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      {/* Customer Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Assigned Customer</CardTitle>
            {quote.customer && (
              <Link
                href={`/admin/customers/${quote.customer.id}`}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                View Profile →
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {quote.customer ? (
            <div className="space-y-4">
              {/* Name and Type */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-gray-400" />
                  <p className="text-base font-semibold text-gray-900">
                    {quote.customer.first_name} {quote.customer.last_name}
                  </p>
                </div>
                {quote.customer.customer_type && (
                  <Badge variant={quote.customer.customer_type === 'professional' ? 'info' : 'default'}>
                    {quote.customer.customer_type === 'professional' ? 'Professional' : 'Enthusiast'}
                  </Badge>
                )}
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-3 rounded-md bg-gray-50 p-3">
                <div>
                  <p className="text-xs text-gray-500">Phone</p>
                  <p className="text-sm font-medium text-gray-900">
                    {quote.customer.phone ? formatPhone(quote.customer.phone) : '\u2014'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {quote.customer.email || '\u2014'}
                  </p>
                </div>
              </div>

              {/* Stats */}
              {customerStats && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 rounded-md border border-gray-100 p-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Member Since</p>
                      <p className="text-sm font-medium text-gray-900">
                        {customerStats.memberSince ? formatDate(customerStats.memberSince) : '\u2014'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-gray-100 p-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Last Visit</p>
                      <p className="text-sm font-medium text-gray-900">
                        {customerStats.lastVisit ? formatDate(customerStats.lastVisit) : 'Never'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-gray-100 p-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-xs text-gray-500">Lifetime Spend</p>
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(customerStats.lifetimeSpend)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-gray-100 p-2">
                    <Award className="h-4 w-4 text-amber-500" />
                    <div>
                      <p className="text-xs text-gray-500">Loyalty Points</p>
                      <p className="text-sm font-medium text-gray-900">
                        {customerStats.loyaltyPoints.toLocaleString()} pts
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Visit Count Badge */}
              {customerStats && customerStats.visitCount > 0 && (
                <p className="text-xs text-gray-500">
                  {customerStats.visitCount} {customerStats.visitCount === 1 ? 'visit' : 'visits'} on record
                </p>
              )}

              {/* Vehicle */}
              {quote.vehicle && (
                <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                  <Car className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Vehicle</p>
                    <p className="text-sm font-medium text-gray-900">
                      {[quote.vehicle.year, quote.vehicle.make, quote.vehicle.model].filter(Boolean).join(' ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Unknown customer</p>
          )}
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle>Services</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="pb-2 text-left font-medium text-gray-500">Item</th>
                  <th className="pb-2 text-center font-medium text-gray-500">Qty</th>
                  <th className="pb-2 text-right font-medium text-gray-500">Unit Price</th>
                  <th className="pb-2 text-right font-medium text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody>
                {(quote.items || []).map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-3">
                      <div className="font-medium text-gray-900">{item.item_name}</div>
                      {item.tier_name && (
                        <div className="text-xs text-gray-500">{item.tier_name}</div>
                      )}
                      {item.notes && (
                        <div className="text-xs text-gray-400">{item.notes}</div>
                      )}
                    </td>
                    <td className="py-3 text-center text-gray-600">{item.quantity}</td>
                    <td className="py-3 text-right text-gray-600">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="py-3 text-right font-medium text-gray-900">
                      {formatCurrency(item.total_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-2 border-t border-gray-200 pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium">{formatCurrency(quote.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax</span>
              <span className="font-medium">{formatCurrency(quote.tax_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2 text-base">
              <span className="font-semibold">Total</span>
              <span className="font-bold">{formatCurrency(quote.total_amount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Created:</span>{' '}
              <span className="text-gray-900">{formatDate(quote.created_at)}</span>
            </div>
            {quote.valid_until && (
              <div>
                <span className="text-gray-500">Valid Until:</span>{' '}
                <span className="text-gray-900">{formatDate(quote.valid_until)}</span>
              </div>
            )}
            {quote.viewed_at && (
              <div>
                <span className="text-gray-500">Viewed:</span>{' '}
                <span className="text-gray-900">{formatDate(quote.viewed_at)}</span>
              </div>
            )}
            {quote.accepted_at && (
              <div>
                <span className="text-gray-500">Accepted:</span>{' '}
                <span className="text-gray-900">{formatDate(quote.accepted_at)}</span>
              </div>
            )}
          </div>
          {quote.notes && (
            <div>
              <span className="text-sm text-gray-500">Notes:</span>
              <p className="mt-1 text-sm text-gray-700">{quote.notes}</p>
            </div>
          )}

          {/* Last Contacted (read-only, no send button) */}
          <div className="border-t border-gray-200 pt-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Last Contacted</p>
              {quote.sent_at ? (
                <p className="text-sm text-gray-500">{formatDateTime(quote.sent_at)}</p>
              ) : (
                <p className="text-sm text-gray-400">Never sent</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Communication History */}
      <Card>
        <CardHeader>
          <CardTitle>Communication History</CardTitle>
        </CardHeader>
        <CardContent>
          {communications.length === 0 ? (
            <p className="text-sm text-gray-400">No messages sent yet</p>
          ) : (
            <div className="space-y-3">
              {communications.map((comm) => (
                <div
                  key={comm.id}
                  className="flex items-start justify-between rounded-md border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-full p-1.5 ${comm.channel === 'email' ? 'bg-blue-100' : 'bg-green-100'}`}>
                      {comm.channel === 'email' ? (
                        <Mail className={`h-4 w-4 ${comm.status === 'sent' ? 'text-blue-600' : 'text-red-500'}`} />
                      ) : (
                        <MessageSquare className={`h-4 w-4 ${comm.status === 'sent' ? 'text-green-600' : 'text-red-500'}`} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {comm.channel === 'email' ? 'Email' : 'SMS'}{' '}
                        {comm.status === 'sent' ? 'sent' : 'failed'}
                      </p>
                      <p className="text-xs text-gray-500">
                        To: {comm.channel === 'email' ? comm.sent_to : formatPhone(comm.sent_to)}
                      </p>
                      {comm.error_message && (
                        <p className="mt-1 text-xs text-red-500">{comm.error_message}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">{formatDateTime(comm.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
