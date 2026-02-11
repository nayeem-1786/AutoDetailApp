'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface Recipient {
  customerId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  variantLabel: string | null;
  deliveryStatus: string;
  clicked: boolean;
  clickCount: number;
  optedOut: boolean;
  converted: boolean;
  revenueAttributed: number;
  sentAt: string;
  couponCode: string | null;
}

interface RecipientTableProps {
  campaignId: string;
  initialData: Recipient[];
  initialTotal: number;
  initialPage: number;
  perPage: number;
  hasVariants: boolean;
  loading: boolean;
  onPageChange: (page: number, filter: string) => void;
}

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'clicked', label: 'Clicked' },
  { key: 'converted', label: 'Converted' },
  { key: 'failed', label: 'Failed' },
  { key: 'opted_out', label: 'Opted Out' },
];

const STATUS_BADGE: Record<string, { variant: 'success' | 'destructive' | 'secondary' | 'default'; label: string }> = {
  delivered: { variant: 'success', label: 'Delivered' },
  sent: { variant: 'default', label: 'Sent' },
  failed: { variant: 'destructive', label: 'Failed' },
  undelivered: { variant: 'destructive', label: 'Failed' },
  pending: { variant: 'secondary', label: 'Pending' },
};

export function RecipientTable({
  initialData,
  initialTotal,
  initialPage,
  perPage,
  hasVariants,
  loading,
  onPageChange,
}: RecipientTableProps) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('');

  const recipients = initialData;
  const total = initialTotal;
  const page = initialPage;
  const totalPages = Math.ceil(total / perPage);

  const handleFilterChange = useCallback((filter: string) => {
    setActiveFilter(filter);
    onPageChange(1, filter);
  }, [onPageChange]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Recipients ({total})</CardTitle>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => handleFilterChange(f.key)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  activeFilter === f.key
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && recipients.length === 0 ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : recipients.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No recipients match this filter.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Contact</th>
                    {hasVariants && <th className="px-4 py-3">Variant</th>}
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Clicked</th>
                    <th className="px-4 py-3">Converted</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recipients.map((r, i) => {
                    const status = STATUS_BADGE[r.deliveryStatus] ?? STATUS_BADGE.pending;
                    return (
                      <tr
                        key={`${r.customerId}-${i}`}
                        className="cursor-pointer transition-colors hover:bg-gray-50"
                        onClick={() => r.customerId && router.push(`/admin/customers/${r.customerId}`)}
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                          {r.firstName} {r.lastName}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {r.phone && <div className="text-xs">{r.phone}</div>}
                          {r.email && <div className="text-xs">{r.email}</div>}
                        </td>
                        {hasVariants && (
                          <td className="px-4 py-3">
                            {r.variantLabel ? (
                              <span className={cn(
                                'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold',
                                r.variantLabel === 'A' ? 'bg-blue-50 text-blue-700' :
                                r.variantLabel === 'B' ? 'bg-purple-50 text-purple-700' :
                                'bg-amber-50 text-amber-700'
                              )}>
                                {r.variantLabel}
                              </span>
                            ) : '\u2014'}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <Badge variant={status.variant}>{status.label}</Badge>
                          {r.optedOut && (
                            <Badge variant="destructive" className="ml-1">Opted Out</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-gray-900">
                          {r.clicked ? (
                            <span className="text-green-600">{r.clickCount} click{r.clickCount !== 1 ? 's' : ''}</span>
                          ) : (
                            <span className="text-gray-400">\u2014</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.converted ? (
                            <Badge variant="success">Yes</Badge>
                          ) : (
                            <span className="text-gray-400">\u2014</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                          {r.revenueAttributed > 0 ? formatCurrency(r.revenueAttributed) : '\u2014'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
                <p className="text-xs text-gray-500">
                  Showing {(page - 1) * perPage + 1}&ndash;{Math.min(page * perPage, total)} of {total}
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => onPageChange(page - 1, activeFilter)}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => onPageChange(page + 1, activeFilter)}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
