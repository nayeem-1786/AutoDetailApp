import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { getBusinessInfo } from '@/lib/data/business';
import type { Quote, QuoteItem, Customer, Vehicle } from '@/lib/supabase/types';
import { AcceptQuoteButton } from './accept-button';

type QuoteWithRelations = Quote & {
  customer?: Customer | null;
  vehicle?: Vehicle | null;
  items?: QuoteItem[];
};

interface PageProps {
  params: Promise<{ token: string }>;
}

async function getQuote(token: string): Promise<QuoteWithRelations | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('quotes')
    .select(
      `
      *,
      customer:customers(id, first_name, last_name, phone, email),
      vehicle:vehicles(id, year, make, model, color),
      items:quote_items(*)
    `
    )
    .eq('access_token', token)
    .single();

  if (error || !data) return null;

  // Mark as viewed if status is 'sent'
  if (data.status === 'sent' && !data.viewed_at) {
    await supabase
      .from('quotes')
      .update({
        status: 'viewed',
        viewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id);

    data.status = 'viewed';
    data.viewed_at = new Date().toISOString();
  }

  return data as QuoteWithRelations;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const [quote, businessInfo] = await Promise.all([getQuote(token), getBusinessInfo()]);

  if (!quote) {
    return { title: `Quote Not Found | ${businessInfo.name}` };
  }

  return {
    title: `Quote ${quote.quote_number} | ${businessInfo.name}`,
    description: `View your quote ${quote.quote_number} from ${businessInfo.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicQuotePage({ params }: PageProps) {
  const { token } = await params;
  const [quote, businessInfo] = await Promise.all([getQuote(token), getBusinessInfo()]);

  if (!quote) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Quote Not Found</h1>
        <p className="mt-2 text-gray-500">
          This quote link is invalid or has expired. Please contact us for assistance.
        </p>
      </div>
    );
  }

  const isExpired = quote.status === 'expired';
  const isAccepted = quote.status === 'accepted';
  const isConverted = quote.status === 'converted';
  const canAccept = quote.status === 'sent' || quote.status === 'viewed';

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Business Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">{businessInfo.name}</h1>
        <p className="mt-1 text-sm text-gray-500">{businessInfo.address}</p>
      </div>

      {/* Quote Header */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Quote {quote.quote_number}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Date: {formatDate(quote.created_at)}
            </p>
            {quote.valid_until && (
              <p className="text-sm text-gray-500">
                Valid Until: {formatDate(quote.valid_until)}
              </p>
            )}
          </div>
          <div className="text-right">
            {quote.customer && (
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {quote.customer.first_name} {quote.customer.last_name}
                </p>
                {quote.customer.email && (
                  <p className="text-sm text-gray-500">{quote.customer.email}</p>
                )}
              </div>
            )}
            {quote.vehicle && (
              <p className="mt-1 text-sm text-gray-500">
                {[quote.vehicle.year, quote.vehicle.make, quote.vehicle.model]
                  .filter(Boolean)
                  .join(' ')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Status Banners */}
      {isExpired && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-6 py-4">
          <p className="text-sm font-medium text-red-800">This quote has expired.</p>
          <p className="mt-1 text-sm text-red-600">
            Please contact us if you would like a new quote.
          </p>
        </div>
      )}

      {isAccepted && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-6 py-4">
          <p className="text-sm font-medium text-green-800">
            Quote Accepted on {quote.accepted_at ? formatDate(quote.accepted_at) : 'N/A'}
          </p>
          <p className="mt-1 text-sm text-green-600">
            Thank you! We will be in touch to schedule your appointment.
          </p>
        </div>
      )}

      {isConverted && (
        <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 px-6 py-4">
          <p className="text-sm font-medium text-purple-800">
            This quote has been converted to an appointment.
          </p>
          <p className="mt-1 text-sm text-purple-600">
            If you have any questions, please do not hesitate to contact us.
          </p>
        </div>
      )}

      {/* Line Items Table */}
      <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left font-medium text-gray-600">Item</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Qty</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Unit Price</th>
                <th className="px-6 py-3 text-right font-medium text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {(quote.items || []).map((item) => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{item.item_name}</div>
                    {item.tier_name && (
                      <div className="text-xs text-gray-500">{item.tier_name}</div>
                    )}
                    {item.notes && (
                      <div className="mt-1 text-xs text-gray-400">{item.notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center text-gray-600">{item.quantity}</td>
                  <td className="px-4 py-4 text-right text-gray-600">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900">
                    {formatCurrency(item.total_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium text-gray-900">{formatCurrency(quote.subtotal)}</span>
            </div>
            {quote.tax_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax</span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(quote.tax_amount)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-2">
              <span className="text-base font-semibold text-gray-900">Total</span>
              <span className="text-lg font-bold text-gray-900">
                {formatCurrency(quote.total_amount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {quote.notes && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white px-6 py-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-700">Notes</h3>
          <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}

      {/* Accept Button */}
      {canAccept && (
        <div className="text-center">
          <AcceptQuoteButton quoteId={quote.id} accessToken={quote.access_token!} />
        </div>
      )}
    </div>
  );
}
