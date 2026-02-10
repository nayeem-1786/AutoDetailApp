'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Automation {
  id: string;
  name: string;
  trigger: string;
  totalExecutions: number;
  delivered: number;
  deliveryRate: number;
  clicked: number;
  clickRate: number;
  conversions: number;
  revenue: number;
}

interface AutomationResponse {
  automations: Automation[];
}

interface AutomationTableProps {
  period: string;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

type SortKey = keyof Pick<
  Automation,
  'name' | 'trigger' | 'totalExecutions' | 'delivered' | 'clicked' | 'conversions' | 'revenue'
>;

type SortDirection = 'asc' | 'desc';

function compareAutomations(a: Automation, b: Automation, key: SortKey, dir: SortDirection): number {
  let aVal: string | number;
  let bVal: string | number;

  switch (key) {
    case 'name':
    case 'trigger':
      aVal = a[key].toLowerCase();
      bVal = b[key].toLowerCase();
      break;
    default:
      aVal = a[key];
      bVal = b[key];
  }

  if (aVal < bVal) return dir === 'asc' ? -1 : 1;
  if (aVal > bVal) return dir === 'asc' ? 1 : -1;
  return 0;
}

// ---------------------------------------------------------------------------
// Trigger badge styling
// ---------------------------------------------------------------------------

const TRIGGER_BADGE_CLASSES: Record<string, string> = {
  new_customer: 'bg-green-100 text-green-800',
  service_completed: 'bg-blue-100 text-blue-800',
  after_transaction: 'bg-purple-100 text-purple-800',
  appointment_booked: 'bg-indigo-100 text-indigo-800',
  quote_accepted: 'bg-amber-100 text-amber-800',
  inactive_customer: 'bg-red-100 text-red-800',
  birthday: 'bg-pink-100 text-pink-800',
};

const TRIGGER_LABELS: Record<string, string> = {
  new_customer: 'New Customer',
  service_completed: 'Service Completed',
  after_transaction: 'After Transaction',
  appointment_booked: 'Appointment Booked',
  quote_accepted: 'Quote Accepted',
  inactive_customer: 'Inactive Customer',
  birthday: 'Birthday',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AutomationTable({ period }: AutomationTableProps) {
  const router = useRouter();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('totalExecutions');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // ---------- Fetch ----------

  const fetchAutomations = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/marketing/analytics/automations?period=${encodeURIComponent(p)}`);
      if (res.ok) {
        const data: AutomationResponse = await res.json();
        setAutomations(data.automations ?? []);
      } else {
        console.error('Error fetching automation analytics:', res.status);
        setAutomations([]);
      }
    } catch (err) {
      console.error('Unexpected error fetching automation analytics:', err);
      setAutomations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAutomations(period);
  }, [period, fetchAutomations]);

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
    return [...automations].sort((a, b) => compareAutomations(a, b, sortKey, sortDir));
  }, [automations, sortKey, sortDir]);

  // ---------- Skeleton rows ----------

  if (loading) {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Automation Performance</h3>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">Rule Name</th>
                    <th className="px-4 py-3">Trigger</th>
                    <th className="px-4 py-3">Total Executions</th>
                    <th className="px-4 py-3">Delivered</th>
                    <th className="px-4 py-3">Clicked</th>
                    <th className="px-4 py-3">Conversions</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-full" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
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
      <h3 className="text-lg font-semibold text-gray-900">Automation Performance</h3>

      <Card>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h3 className="text-lg font-medium text-gray-900">No automations have fired yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Set up lifecycle automations to track their performance here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <SortableHeader label="Rule Name" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Trigger" sortKey="trigger" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Total Executions" sortKey="totalExecutions" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Delivered" sortKey="delivered" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Clicked" sortKey="clicked" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Conversions" sortKey="conversions" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Revenue" sortKey="revenue" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((automation) => (
                    <tr
                      key={automation.id}
                      onClick={() => router.push('/admin/marketing/automations')}
                      className="cursor-pointer transition-colors hover:bg-gray-50"
                    >
                      {/* Rule Name */}
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                        {automation.name}
                      </td>

                      {/* Trigger */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            TRIGGER_BADGE_CLASSES[automation.trigger] ?? 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {TRIGGER_LABELS[automation.trigger] ?? automation.trigger.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Total Executions */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                        {automation.totalExecutions.toLocaleString()}
                      </td>

                      {/* Delivered */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                        {automation.delivered.toLocaleString()}
                        <span className="ml-1 text-xs text-gray-500">
                          ({automation.deliveryRate.toFixed(1)}%)
                        </span>
                      </td>

                      {/* Clicked */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                        {automation.clicked.toLocaleString()}
                        <span className="ml-1 text-xs text-gray-500">
                          ({automation.clickRate.toFixed(1)}%)
                        </span>
                      </td>

                      {/* Conversions */}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                        {automation.conversions}
                      </td>

                      {/* Revenue */}
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                        {formatCurrency(automation.revenue)}
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
      <span className="inline-flex items-center gap-1">
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
