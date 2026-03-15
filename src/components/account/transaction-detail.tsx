'use client';

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Spinner } from '@/components/ui/spinner';

interface TransactionItem {
  id: string;
  item_type: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tax_amount: number;
  tier_name: string | null;
  vehicle_size_class: string | null;
  prerequisite_note: string | null;
}

interface TransactionPayment {
  id: string;
  method: string;
  amount: number;
  tip_amount: number;
  card_brand: string | null;
  card_last_four: string | null;
}

interface TransactionDetailData {
  subtotal: number;
  tax_amount: number;
  tip_amount: number;
  discount_amount: number;
  total_amount: number;
  loyalty_points_earned: number;
  loyalty_points_redeemed: number;
  loyalty_discount: number;
  transaction_items: TransactionItem[];
  payments: TransactionPayment[];
  vehicles: { year: number | null; make: string | null; model: string | null; color: string | null } | null;
}

interface TransactionDetailProps {
  transactionId: string;
}

export function TransactionDetail({ transactionId }: TransactionDetailProps) {
  const [data, setData] = useState<TransactionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/customer/transactions/${transactionId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load');
        const json = await res.json();
        setData(json.data);
      })
      .catch(() => setError('Failed to load transaction details'))
      .finally(() => setLoading(false));
  }, [transactionId]);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-red-400">{error || 'Failed to load details'}</p>;
  }

  const vehicle = data.vehicles;
  const vehicleLabel = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
    : null;

  return (
    <div className="space-y-4">
      {/* Vehicle */}
      {vehicleLabel && (
        <p className="text-xs text-site-text-faint">
          Vehicle: {vehicle?.color ? `${vehicle.color} ` : ''}{vehicleLabel}
        </p>
      )}

      {/* Items */}
      {data.transaction_items.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase text-site-text-faint">Items</h4>
          <div className="space-y-1.5">
            {data.transaction_items.map((item) => (
              <div key={item.id} className="flex items-start justify-between text-sm">
                <div className="min-w-0 flex-1">
                  <span className="text-site-text">{item.item_name}</span>
                  {item.quantity > 1 && (
                    <span className="ml-1 text-site-text-faint">x{item.quantity}</span>
                  )}
                  {item.tier_name && (
                    <span className="ml-1 text-xs text-site-text-faint">({item.tier_name})</span>
                  )}
                  {item.prerequisite_note && (
                    <p className="text-xs text-blue-500 mt-0.5">{item.prerequisite_note}</p>
                  )}
                </div>
                <span className="ml-3 text-site-text-muted">{formatCurrency(item.total_price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="border-t border-site-border pt-3">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-site-text-muted">
            <span>Subtotal</span>
            <span>{formatCurrency(data.subtotal)}</span>
          </div>
          {data.tax_amount > 0 && (
            <div className="flex justify-between text-site-text-muted">
              <span>Tax</span>
              <span>{formatCurrency(data.tax_amount)}</span>
            </div>
          )}
          {data.discount_amount > 0 && (
            <div className="flex justify-between text-green-400">
              <span>Discount</span>
              <span>-{formatCurrency(data.discount_amount)}</span>
            </div>
          )}
          {data.loyalty_discount > 0 && (
            <div className="flex justify-between text-green-400">
              <span>Loyalty Discount ({data.loyalty_points_redeemed} pts)</span>
              <span>-{formatCurrency(data.loyalty_discount)}</span>
            </div>
          )}
          {data.tip_amount > 0 && (
            <div className="flex justify-between text-site-text-muted">
              <span>Tip</span>
              <span>{formatCurrency(data.tip_amount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-site-text">
            <span>Total</span>
            <span>{formatCurrency(data.total_amount)}</span>
          </div>
        </div>
      </div>

      {/* Payments */}
      {data.payments.length > 0 && (
        <div className="border-t border-site-border pt-3">
          <h4 className="mb-2 text-xs font-medium uppercase text-site-text-faint">Payments</h4>
          <div className="space-y-1 text-sm">
            {data.payments.map((payment) => (
              <div key={payment.id} className="flex justify-between text-site-text-muted">
                <span className="capitalize">
                  {payment.method}
                  {payment.card_brand && payment.card_last_four
                    ? ` (${payment.card_brand} ****${payment.card_last_four})`
                    : ''}
                </span>
                <span>{formatCurrency(payment.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loyalty earned */}
      {data.loyalty_points_earned > 0 && (
        <p className="text-xs text-green-400">
          +{data.loyalty_points_earned} loyalty points earned
        </p>
      )}
    </div>
  );
}
