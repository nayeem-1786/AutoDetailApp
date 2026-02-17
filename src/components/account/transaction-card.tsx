import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils/format';

interface TransactionCardProps {
  transaction: {
    id: string;
    receipt_number: string | null;
    status: string;
    total_amount: number;
    payment_method: string | null;
    loyalty_points_earned: number;
    transaction_date: string;
  };
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

export function TransactionCard({
  transaction,
  expanded,
  onToggle,
  children,
}: TransactionCardProps) {
  return (
    <div className="rounded-lg border border-site-border bg-brand-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 p-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-site-text">
              #{transaction.receipt_number || '—'}
            </span>
            <Badge
              variant={transaction.status === 'refunded' ? 'destructive' : 'success'}
            >
              {transaction.status === 'refunded' ? 'Refunded' : 'Completed'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-site-text-muted">
            {formatDate(transaction.transaction_date)}
          </p>
          <div className="mt-1 flex items-center gap-3 text-xs text-site-text-faint">
            {transaction.payment_method && (
              <span className="capitalize">{transaction.payment_method}</span>
            )}
            {transaction.loyalty_points_earned > 0 && (
              <span>+{transaction.loyalty_points_earned} pts</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-site-text">
            {formatCurrency(transaction.total_amount)}
          </span>
          <svg
            className={`h-4 w-4 text-site-text-faint transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && children && (
        <div className="border-t border-site-border p-5 pt-4">{children}</div>
      )}
    </div>
  );
}
