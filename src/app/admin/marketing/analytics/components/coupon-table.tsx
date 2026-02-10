'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CouponPerformance {
  id: string;
  code: string;
  distributed: number;
  redeemed: number;
  redemptionRate: number;
  discountGiven: number;
  revenueFromOrders: number;
  roi: number;
}

interface CouponResponse {
  coupons: CouponPerformance[];
}

interface CouponTableProps {
  period: string;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

type SortKey = keyof Pick<
  CouponPerformance,
  'code' | 'distributed' | 'redeemed' | 'redemptionRate' | 'discountGiven' | 'revenueFromOrders' | 'roi'
>;

type SortDirection = 'asc' | 'desc';

function compareCoupons(a: CouponPerformance, b: CouponPerformance, key: SortKey, dir: SortDirection): number {
  let aVal: string | number;
  let bVal: string | number;

  if (key === 'code') {
    aVal = a.code.toLowerCase();
    bVal = b.code.toLowerCase();
  } else {
    aVal = a[key];
    bVal = b[key];
  }

  if (aVal < bVal) return dir === 'asc' ? -1 : 1;
  if (aVal > bVal) return dir === 'asc' ? 1 : -1;
  return 0;
}

// ---------------------------------------------------------------------------
// ROI color helper
// ---------------------------------------------------------------------------

function getRoiClasses(roi: number): string {
  if (roi >= 3) return 'text-green-700 bg-green-50';
  if (roi >= 1) return 'text-amber-700 bg-amber-50';
  return 'text-red-700 bg-red-50';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CouponTable({ period }: CouponTableProps) {
  const router = useRouter();
  const [coupons, setCoupons] = useState<CouponPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('redeemed');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // ---------- Fetch ----------

  const fetchCoupons = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/marketing/analytics/coupons?period=${encodeURIComponent(p)}`);
      if (res.ok) {
        const data: CouponResponse = await res.json();
        setCoupons(data.coupons ?? []);
      } else {
        console.error('Error fetching coupon analytics:', res.status);
        setCoupons([]);
      }
    } catch (err) {
      console.error('Unexpected error fetching coupon analytics:', err);
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoupons(period);
  }, [period, fetchCoupons]);

  // ---------- Sort ----------

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = useMemo(() => {
    return [...coupons].sort((a, b) => compareCoupons(a, b, sortKey, sortDir));
  }, [coupons, sortKey, sortDir]);

  // ---------- Skeleton rows ----------

  if (loading) {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Coupon Performance</h3>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Distributed</th>
                    <th className="px-4 py-3">Redeemed</th>
                    <th className="px-4 py-3">Redemption Rate</th>
                    <th className="px-4 py-3 text-right">Discount Given</th>
                    <th className="px-4 py-3 text-right">Revenue from Orders</th>
                    <th className="px-4 py-3 text-right">ROI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20 ml-auto" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20 ml-auto" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-12 ml-auto rounded" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- Render ----------

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900">Coupon Performance</h3>

      <Card>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h3 className="text-lg font-medium text-gray-900">No coupons distributed yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Distribute coupons through campaigns or automations to track their performance.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <SortableHeader label="Code" sortKey="code" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Distributed" sortKey="distributed" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Redeemed" sortKey="redeemed" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Redemption Rate" sortKey="redemptionRate" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Discount Given" sortKey="discountGiven" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                    <SortableHeader label="Revenue from Orders" sortKey="revenueFromOrders" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                    <SortableHeader label="ROI" sortKey="roi" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((coupon) => (
                    <tr
                      key={coupon.id}
                      onClick={() => router.push('/admin/marketing/coupons')}
                      className="cursor-pointer transition-colors hover:bg-gray-50"
                    >
                      {/* Code */}
                      <td className="whitespace-nowrap px-4 py-3 font-mono font-medium text-gray-900">
                        {coupon.code}
                      </td>

                      {/* Distributed */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                        {coupon.distributed.toLocaleString()}
                      </td>

                      {/* Redeemed */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                        {coupon.redeemed.toLocaleString()}
                      </td>

                      {/* Redemption Rate */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                        {coupon.redemptionRate.toFixed(1)}%
                      </td>

                      {/* Discount Given */}
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-900">
                        {formatCurrency(coupon.discountGiven)}
                      </td>

                      {/* Revenue from Orders */}
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                        {formatCurrency(coupon.revenueFromOrders)}
                      </td>

                      {/* ROI */}
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span
                          className={cn(
                            'inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold tabular-nums',
                            getRoiClasses(coupon.roi)
                          )}
                        >
                          {coupon.roi.toFixed(1)}x
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable Header Helper
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDirection;
  onSort: (key: SortKey) => void;
  align?: 'right';
}) {
  const isActive = currentKey === sortKey;
  return (
    <th
      className={`px-4 py-3 cursor-pointer select-none hover:text-gray-700 ${align === 'right' ? 'text-right' : ''}`}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        <ArrowUpDown
          className={`h-3.5 w-3.5 ${isActive ? 'text-gray-700' : 'text-gray-400'} ${
            isActive && currentDir === 'asc' ? 'rotate-180' : ''
          }`}
        />
      </span>
    </th>
  );
}
