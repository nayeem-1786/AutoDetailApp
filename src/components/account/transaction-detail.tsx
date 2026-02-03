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
    return <p className="text-sm text-red-600">{error || 'Failed to load details'}</p>;
  }

  const vehicle = data.vehicles;
  const vehicleLabel = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
    : null;

  return (
    <div className="space-y-4">
      {/* Vehicle */}
      {vehicleLabel && (
        <p className="text-xs text-gray-500">
          Vehicle: {vehicle?.color ? `${vehicle.color} ` : ''}{vehicleLabel}
        </p>
      )}

      {/* Items */}
      {data.transaction_items.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">Items</h4>
          <div className="space-y-1.5">
            {data.transaction_items.map((item) => (
              <div key={item.id} className="flex items-start justify-between text-sm">
                <div className="min-w-0 flex-1">
                  <span className="text-gray-900">{item.item_name}</span>
                  {item.quantity > 1 && (
                    <span className="ml-1 text-gray-500">x{item.quantity}</span>
                  )}
                  {item.tier_name && (
                    <span className="ml-1 text-xs text-gray-400">({item.tier_name})</span>
                  )}
                </div>
                <span className="ml-3 text-gray-700">{formatCurrency(item.total_price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="border-t border-gray-100 pt-3">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>{formatCurrency(data.subtotal)}</span>
          </div>
          {data.tax_amount > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Tax</span>
              <span>{formatCurrency(data.tax_amount)}</span>
            </div>
          )}
          {data.discount_amount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span>-{formatCurrency(data.discount_amount)}</span>
            </div>
          )}
          {data.loyalty_discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Loyalty Discount ({data.loyalty_points_redeemed} pts)</span>
              <span>-{formatCurrency(data.loyalty_discount)}</span>
            </div>
          )}
          {data.tip_amount > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Tip</span>
              <span>{formatCurrency(data.tip_amount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-gray-900">
            <span>Total</span>
            <span>{formatCurrency(data.total_amount)}</span>
          </div>
        </div>
      </div>

      {/* Payments */}
      {data.payments.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <h4 className="mb-2 text-xs font-medium uppercase text-gray-500">Payments</h4>
          <div className="space-y-1 text-sm">
            {data.payments.map((payment) => (
              <div key={payment.id} className="flex justify-between text-gray-600">
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
        <p className="text-xs text-green-600">
          +{data.loyalty_points_earned} loyalty points earned
        </p>
      )}
    </div>
  );
}
