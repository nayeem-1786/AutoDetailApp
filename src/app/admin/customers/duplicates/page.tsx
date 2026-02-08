'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatPhone, formatRelativeDate } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ChevronLeft, Merge, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DuplicateCustomer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  lifetime_spend: number;
  visit_count: number;
  created_at: string;
}

interface DuplicateGroup {
  group_id: string;
  confidence: 'high' | 'medium';
  match_reason: string;
  customers: DuplicateCustomer[];
}

const MATCH_REASON_LABELS: Record<string, string> = {
  phone: 'Phone Match',
  email: 'Email Match',
  'name+phone': 'Name + Phone',
  'name+email': 'Name + Email',
};

function getConfidenceVariant(confidence: string): 'destructive' | 'warning' {
  return confidence === 'high' ? 'destructive' : 'warning';
}

export default function DuplicateCustomersPage() {
  const supabase = createClient();

  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeep, setSelectedKeep] = useState<Record<string, string>>({});
  const [mergingGroup, setMergingGroup] = useState<string | null>(null);
  const [mergingAll, setMergingAll] = useState(false);

  const fetchDuplicates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('find_duplicate_customers');
    if (error) {
      console.error('Error finding duplicates:', error);
      toast.error('Failed to load duplicate customers');
      setGroups([]);
    } else {
      const result = (data as DuplicateGroup[]) || [];
      setGroups(result);
      // Default selection: first customer in each group (highest spend)
      const defaults: Record<string, string> = {};
      result.forEach((g) => {
        if (g.customers.length > 0) {
          defaults[g.group_id] = g.customers[0].id;
        }
      });
      setSelectedKeep(defaults);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchDuplicates();
  }, [fetchDuplicates]);

  async function handleMerge(group: DuplicateGroup) {
    const keepId = selectedKeep[group.group_id];
    if (!keepId) return;

    const mergeIds = group.customers.filter((c) => c.id !== keepId).map((c) => c.id);
    if (mergeIds.length === 0) return;

    setMergingGroup(group.group_id);
    const { data, error } = await supabase.rpc('merge_customers', {
      keep_id: keepId,
      merge_ids: mergeIds,
    });

    if (error) {
      console.error('Error merging customers:', error);
      toast.error('Failed to merge customers');
    } else {
      const keepCustomer = group.customers.find((c) => c.id === keepId);
      const name = keepCustomer
        ? `${keepCustomer.first_name} ${keepCustomer.last_name}`
        : 'customer';
      const counts = data as { merged: number } | null;
      toast.success(
        `Merged ${mergeIds.length} record${mergeIds.length !== 1 ? 's' : ''} into ${name}${counts?.merged ? ` (${counts.merged} updated)` : ''}`
      );
      setGroups((prev) => prev.filter((g) => g.group_id !== group.group_id));
    }
    setMergingGroup(null);
  }

  async function handleMergeAll() {
    setMergingAll(true);
    let mergedCount = 0;
    const remaining = [...groups];

    for (const group of remaining) {
      const keepId = selectedKeep[group.group_id];
      if (!keepId) continue;

      const mergeIds = group.customers.filter((c) => c.id !== keepId).map((c) => c.id);
      if (mergeIds.length === 0) continue;

      const { error } = await supabase.rpc('merge_customers', {
        keep_id: keepId,
        merge_ids: mergeIds,
      });

      if (error) {
        console.error(`Error merging group ${group.group_id}:`, error);
        toast.error(`Failed to merge group: ${group.match_reason}`);
        break;
      }

      mergedCount++;
      setGroups((prev) => prev.filter((g) => g.group_id !== group.group_id));
    }

    if (mergedCount > 0) {
      toast.success(`Merged ${mergedCount} duplicate group${mergedCount !== 1 ? 's' : ''}`);
    }
    setMergingAll(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Duplicate Customers"
        description={
          groups.length === 0
            ? 'No duplicates found'
            : `${groups.length} potential duplicate group${groups.length !== 1 ? 's' : ''}`
        }
        action={
          <div className="flex items-center gap-2">
            {groups.length > 0 && (
              <Button onClick={handleMergeAll} disabled={mergingAll}>
                {mergingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Merge className="h-4 w-4" />
                )}
                Merge All ({groups.length})
              </Button>
            )}
          </div>
        }
      />

      <Link href="/admin/customers">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="h-4 w-4" />
          Back to Customers
        </Button>
      </Link>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <h3 className="text-lg font-medium text-gray-900">No duplicates found</h3>
          <p className="mt-1 text-sm text-gray-500">
            All customer records appear to be unique.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isMerging = mergingGroup === group.group_id;

            return (
              <div
                key={group.group_id}
                className="rounded-lg border border-gray-200 bg-white shadow-sm"
              >
                {/* Group header */}
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={getConfidenceVariant(group.confidence)}>
                      {group.confidence}
                    </Badge>
                    <Badge variant="info">
                      {MATCH_REASON_LABELS[group.match_reason] || group.match_reason}
                    </Badge>
                    <span className="text-sm text-gray-500">
                      {group.customers.length} records
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleMerge(group)}
                    disabled={isMerging || mergingAll}
                  >
                    {isMerging ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Merge className="h-4 w-4" />
                    )}
                    Merge
                  </Button>
                </div>

                {/* Customer records side-by-side */}
                <div className="grid gap-3 p-4" style={{ gridTemplateColumns: `repeat(${Math.min(group.customers.length, 4)}, 1fr)` }}>
                  {group.customers.map((customer) => {
                    const isSelected = selectedKeep[group.group_id] === customer.id;

                    return (
                      <label
                        key={customer.id}
                        className={`relative cursor-pointer rounded-lg border p-4 transition-all ${
                          isSelected
                            ? 'border-gray-900 bg-gray-50 ring-2 ring-gray-900'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`keep-${group.group_id}`}
                          value={customer.id}
                          checked={isSelected}
                          onChange={() =>
                            setSelectedKeep((prev) => ({
                              ...prev,
                              [group.group_id]: customer.id,
                            }))
                          }
                          className="sr-only"
                        />

                        {isSelected && (
                          <span className="absolute right-2 top-2 rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-white">
                            Keep
                          </span>
                        )}

                        <div className="space-y-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {customer.first_name} {customer.last_name}
                            </p>
                          </div>

                          <div className="space-y-1 text-xs text-gray-600">
                            <div className="flex justify-between">
                              <span className="text-gray-400">Phone</span>
                              <span>{customer.phone ? formatPhone(customer.phone) : '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Email</span>
                              <span className="truncate ml-2 max-w-[140px] text-right">
                                {customer.email || '--'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Visits</span>
                              <span>{customer.visit_count}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Spend</span>
                              <span className="font-medium text-gray-900">
                                {formatCurrency(customer.lifetime_spend)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Created</span>
                              <span>{formatRelativeDate(customer.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
