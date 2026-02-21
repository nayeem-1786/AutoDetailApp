'use client';

import { Loader2, DollarSign, Receipt, Banknote, CreditCard } from 'lucide-react';
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

function MetricCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
      {detail && (
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
      )}
    </div>
  );
}

export function DaySummary({ summary, loading }: DaySummaryProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        No data for this day
      </div>
    );
  }

  const cashTotal = summary.payments_by_method.cash.amount + summary.payments_by_method.cash.tips;
  const cardTotal = summary.payments_by_method.card.amount + summary.payments_by_method.card.tips;

  return (
    <div className="grid grid-cols-2 gap-3">
      <MetricCard
        icon={DollarSign}
        iconBg="bg-green-50 dark:bg-green-900/30"
        iconColor="text-green-600 dark:text-green-400"
        label="Total Revenue"
        value={formatCurrency(summary.total_revenue)}
        detail={`${formatCurrency(summary.total_tips)} in tips`}
      />
      <MetricCard
        icon={Receipt}
        iconBg="bg-blue-50 dark:bg-blue-900/30"
        iconColor="text-blue-600 dark:text-blue-400"
        label="Transactions"
        value={String(summary.total_transactions)}
        detail={summary.total_refunds > 0 ? `${formatCurrency(summary.total_refunds)} refunds` : undefined}
      />
      <MetricCard
        icon={Banknote}
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
        label="Cash Total"
        value={formatCurrency(cashTotal)}
        detail={`${summary.payments_by_method.cash.count} transaction${summary.payments_by_method.cash.count !== 1 ? 's' : ''}`}
      />
      <MetricCard
        icon={CreditCard}
        iconBg="bg-purple-50"
        iconColor="text-purple-600"
        label="Card Total"
        value={formatCurrency(cardTotal)}
        detail={`${summary.payments_by_method.card.count} transaction${summary.payments_by_method.card.count !== 1 ? 's' : ''}`}
      />
    </div>
  );
}
