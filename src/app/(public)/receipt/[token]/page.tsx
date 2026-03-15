import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { LOYALTY } from '@/lib/utils/constants';
import { getBusinessInfo } from '@/lib/data/business';
import { PrintButton } from './print-button';

interface TransactionWithRelations {
  id: string;
  receipt_number: string | null;
  transaction_date: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  coupon_code: string | null;
  loyalty_discount: number | null;
  loyalty_points_redeemed: number | null;
  tip_amount: number;
  total_amount: number;
  loyalty_points_earned: number;
  customer: { first_name: string; last_name: string } | null;
  employee: { first_name: string; last_name: string } | null;
  vehicle: { year: number | null; make: string | null; model: string | null; color: string | null } | null;
  items: {
    id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    tax_amount: number;
    item_type: string | null;
    standard_price: number | null;
    pricing_type: string | null;
  }[];
  payments: {
    id: string;
    method: string;
    amount: number;
    tip_amount: number;
    card_brand: string | null;
    card_last_four: string | null;
  }[];
}

interface PageProps {
  params: Promise<{ token: string }>;
}

async function getTransaction(token: string): Promise<TransactionWithRelations | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      customer:customers(first_name, last_name),
      employee:employees(first_name, last_name),
      vehicle:vehicles(year, make, model, color),
      items:transaction_items(*),
      payments(*)
    `)
    .eq('access_token', token)
    .single();

  if (error || !data) return null;
  return data as unknown as TransactionWithRelations;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const [tx, businessInfo] = await Promise.all([getTransaction(token), getBusinessInfo()]);

  if (!tx) {
    return {
      title: `Receipt Not Found | ${businessInfo.name}`,
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Receipt ${tx.receipt_number || ''} | ${businessInfo.name}`,
    description: `View your receipt from ${businessInfo.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicReceiptPage({ params }: PageProps) {
  const { token } = await params;
  const [tx, businessInfo] = await Promise.all([getTransaction(token), getBusinessInfo()]);

  if (!tx) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-site-text">Receipt Not Found</h1>
        <p className="mt-2 text-site-text-muted">
          This receipt link is invalid or has expired. Please contact us for assistance.
        </p>
      </div>
    );
  }

  const receiptId = tx.receipt_number || `SD-${tx.id.slice(0, 6).toUpperCase()}`;
  const vehicleStr = tx.vehicle
    ? [tx.vehicle.year, tx.vehicle.make, tx.vehicle.model].filter(Boolean).join(' ')
    : null;
  const customerName = tx.customer
    ? `${tx.customer.first_name} ${tx.customer.last_name}`
    : null;
  const employeeName = tx.employee
    ? `${tx.employee.first_name} ${tx.employee.last_name}`
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Business Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-site-text">{businessInfo.name}</h1>
        <p className="mt-1 text-sm text-site-text-muted">{businessInfo.address}</p>
      </div>

      {/* Receipt Header */}
      <div className="mb-8 rounded-lg border border-site-border bg-brand-dark p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-site-text">
              Receipt {receiptId}
            </h2>
            <p className="mt-1 text-sm text-site-text-muted">
              Date: {formatDate(tx.transaction_date)}
            </p>
            {customerName && (
              <p className="text-sm text-site-text-muted">
                Customer: {customerName}
              </p>
            )}
          </div>
          <div className="text-right">
            {vehicleStr && (
              <p className="text-sm font-medium text-site-text">{vehicleStr}</p>
            )}
            {tx.vehicle?.color && (
              <p className="text-sm text-site-text-muted">{tx.vehicle.color}</p>
            )}
            {employeeName && (
              <p className="mt-1 text-sm text-site-text-muted">
                Served by: {employeeName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="mb-6 overflow-hidden rounded-lg border border-site-border bg-brand-dark shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-site-border bg-brand-dark">
                <th className="px-6 py-3 text-left font-medium text-site-text-muted">Item</th>
                <th className="px-4 py-3 text-center font-medium text-site-text-muted">Qty</th>
                <th className="px-4 py-3 text-right font-medium text-site-text-muted">Unit Price</th>
                <th className="px-6 py-3 text-right font-medium text-site-text-muted">Total</th>
              </tr>
            </thead>
            <tbody>
              {tx.items.map((item) => (
                <tr key={item.id} className="border-b border-site-border">
                  <td className="px-6 py-4">
                    <div className="font-medium text-site-text">{item.item_name}</div>
                    {item.pricing_type && item.pricing_type !== 'standard' && item.standard_price != null && item.standard_price > item.unit_price && (
                      <div className="text-xs text-green-500 mt-0.5">
                        {item.pricing_type === 'combo' ? 'Combo' : 'Sale'}: Reg {formatCurrency(item.standard_price)} | Saved {formatCurrency(item.standard_price - item.unit_price)}!
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center text-site-text-muted">{item.quantity}</td>
                  <td className="px-4 py-4 text-right text-site-text-muted">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-site-text">
                    {formatCurrency(item.total_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-site-border bg-brand-dark px-6 py-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-site-text-muted">Subtotal</span>
              <span className="font-medium text-site-text">{formatCurrency(tx.subtotal)}</span>
            </div>
            {tx.tax_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-site-text-muted">Tax</span>
                <span className="font-medium text-site-text">
                  {formatCurrency(tx.tax_amount)}
                </span>
              </div>
            )}
            {(() => {
              const nonLoyaltyDiscount = tx.discount_amount - (tx.loyalty_discount || 0);
              return nonLoyaltyDiscount > 0 ? (
                <div className="flex justify-between text-sm">
                  <span className="text-site-text-muted">
                    {tx.coupon_code ? `Coupon (${tx.coupon_code})` : 'Discount'}
                  </span>
                  <span className="font-medium text-amber-400">
                    -{formatCurrency(nonLoyaltyDiscount)}
                  </span>
                </div>
              ) : null;
            })()}
            {tx.loyalty_discount && tx.loyalty_discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-site-text-muted">
                  Loyalty{tx.loyalty_points_redeemed ? ` (${tx.loyalty_points_redeemed} pts)` : ''}
                </span>
                <span className="font-medium text-amber-400">
                  -{formatCurrency(tx.loyalty_discount)}
                </span>
              </div>
            )}
            {tx.tip_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-site-text-muted">Tip</span>
                <span className="font-medium text-site-text">
                  {formatCurrency(tx.tip_amount)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-site-border pt-2">
              <span className="text-base font-semibold text-site-text">Total</span>
              <span className="text-lg font-bold text-site-text">
                {formatCurrency(tx.total_amount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      {tx.payments.length > 0 && (
        <div className="mb-8 rounded-lg border border-site-border bg-brand-dark px-6 py-4 shadow-sm">
          <h3 className="text-sm font-medium text-site-text-secondary">Payment</h3>
          <div className="mt-2 space-y-1">
            {tx.payments.map((p) => {
              const label =
                p.method === 'card' && p.card_brand
                  ? `${p.card_brand} ending in ${p.card_last_four || '****'}`
                  : p.method.charAt(0).toUpperCase() + p.method.slice(1);
              return (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-site-text-muted">{label}</span>
                  <span className="font-medium text-site-text">{formatCurrency(p.amount)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Points Earned */}
      {tx.customer && tx.loyalty_points_earned > 0 && (
        <div className="mb-8 rounded-lg border border-site-border bg-brand-dark px-6 py-4 shadow-sm text-center">
          <p className="text-sm text-green-500 font-medium">
            Points Earned Today: {tx.loyalty_points_earned} ({formatCurrency(tx.loyalty_points_earned * LOYALTY.REDEEM_RATE)} loyalty cash)
          </p>
        </div>
      )}
      {!tx.customer && (() => {
        const hypotheticalPoints = Math.floor(tx.subtotal * LOYALTY.EARN_RATE);
        if (hypotheticalPoints <= 0) return null;
        return (
          <div className="mb-8 rounded-lg border border-site-border bg-brand-dark px-6 py-4 shadow-sm text-center">
            <p className="text-sm text-green-500 font-medium">
              Join our rewards program — this visit would&apos;ve earned you {formatCurrency(hypotheticalPoints * LOYALTY.REDEEM_RATE)} off!
            </p>
          </div>
        );
      })()}

      {/* Print Button */}
      <div className="text-center">
        <PrintButton />
      </div>
    </div>
  );
}
