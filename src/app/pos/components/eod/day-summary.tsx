'use client';

import { Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

interface DaySummaryProps {
  summary: {
    date: string;
    total_transactions: number;
    total_revenue: number;
    total_subtotal: number;
    total_tax: number;
    total_tips: number;
    total_discounts: number;
    total_refunds: number;
    payments_by_method: {
      cash: { count: number; amount: number; tips: number };
      card: { count: number; amount: number; tips: number };
    };
  } | null;
  loading: boolean;
}

function StatRow({
  label,
  value,
  negative,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-600">{label}</span>
      <span
        className={`text-sm font-medium tabular-nums ${
          negative ? 'text-red-600' : 'text-gray-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function PaymentMethodRow({
  method,
  count,
  amount,
  tips,
}: {
  method: string;
  count: number;
  amount: number;
  tips: number;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div>
        <span className="text-sm font-medium text-gray-700">{method}</span>
        <span className="ml-2 text-xs text-gray-400">
          {count} transaction{count !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="text-right">
        <span className="text-sm font-medium tabular-nums text-gray-900">
          {formatCurrency(amount)}
        </span>
        {tips > 0 && (
          <span className="ml-2 text-xs tabular-nums text-gray-500">
            + {formatCurrency(tips)} tips
          </span>
        )}
      </div>
    </div>
  );
}

export function DaySummary({ summary, loading }: DaySummaryProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
        No data for this day
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Day Overview */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          Day Overview
        </h3>
        <div className="space-y-0.5">
          <StatRow
            label="Total Transactions"
            value={String(summary.total_transactions)}
          />
          <StatRow
            label="Gross Revenue"
            value={formatCurrency(summary.total_revenue)}
          />
          <div className="my-1.5 border-t border-gray-200" />
          <StatRow
            label="Subtotal"
            value={formatCurrency(summary.total_subtotal)}
          />
          <StatRow
            label="Tax Collected"
            value={formatCurrency(summary.total_tax)}
          />
          <StatRow
            label="Tips"
            value={formatCurrency(summary.total_tips)}
          />
          <StatRow
            label="Discounts"
            value={formatCurrency(summary.total_discounts)}
          />
          <StatRow
            label="Refunds"
            value={`-${formatCurrency(summary.total_refunds)}`}
            negative
          />
        </div>
      </div>

      {/* Payment Breakdown */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          Payment Breakdown
        </h3>
        <div className="space-y-0.5">
          <PaymentMethodRow
            method="Cash"
            count={summary.payments_by_method.cash.count}
            amount={summary.payments_by_method.cash.amount}
            tips={summary.payments_by_method.cash.tips}
          />
          <div className="border-t border-gray-200" />
          <PaymentMethodRow
            method="Card"
            count={summary.payments_by_method.card.count}
            amount={summary.payments_by_method.card.amount}
            tips={summary.payments_by_method.card.tips}
          />
        </div>
      </div>
    </div>
  );
}
