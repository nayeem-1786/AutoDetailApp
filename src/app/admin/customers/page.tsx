'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Customer } from '@/lib/supabase/types';
import { formatCurrency, formatPhone, formatRelativeDate, formatPoints } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { TableToolbar, type FilterConfig } from '@/components/admin/table-toolbar';
import { useTableState } from '@/lib/hooks/useTableState';
import Link from 'next/link';
import { Plus, Tag, X, Check, ChevronDown, Users } from 'lucide-react';
import { CustomerStats } from './components/customer-stats';
import { usePermission } from '@/lib/hooks/use-permission';
import type { ColumnDef } from '@tanstack/react-table';
import type { BulkAction } from '@/components/ui/data-table';

// ---------------------------------------------------------------------------
// Sub-components (BulkTagDialog + TagFilterDropdown — unchanged)
// ---------------------------------------------------------------------------

function BulkTagDialog({
  open,
  onClose,
  mode,
  allTags,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'add' | 'remove';
  allTags: string[];
  onApply: (tag: string) => Promise<void>;
}) {
  const [tagInput, setTagInput] = useState('');
  const [applying, setApplying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    if (!tagInput.trim()) return allTags;
    const q = tagInput.toLowerCase();
    return allTags.filter((t) => t.toLowerCase().includes(q));
  }, [allTags, tagInput]);

  const showCreateOption =
    mode === 'add' &&
    tagInput.trim() &&
    !allTags.some((t) => t.toLowerCase() === tagInput.trim().toLowerCase());

  useEffect(() => {
    if (open) {
      setTagInput('');
      setApplying(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  async function handleApply(tag: string) {
    setApplying(true);
    await onApply(tag);
    setApplying(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 w-full max-w-sm rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="border-b border-gray-100 p-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {mode === 'add' ? 'Add Tag to Selected' : 'Remove Tag from Selected'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {mode === 'add'
              ? 'Choose an existing tag or type a new one.'
              : 'Choose a tag to remove from selected customers.'}
          </p>
        </div>
        <div className="p-4">
          <input
            ref={inputRef}
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tagInput.trim()) {
                e.preventDefault();
                handleApply(tagInput.trim());
              }
            }}
            placeholder={mode === 'add' ? 'Type a tag name...' : 'Search tags...'}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            disabled={applying}
          />
          <div className="mt-2 max-h-48 overflow-y-auto">
            {showCreateOption && (
              <button
                onClick={() => handleApply(tagInput.trim())}
                disabled={applying}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <Plus className="h-4 w-4 text-green-600" />
                <span>Create &quot;{tagInput.trim()}&quot;</span>
              </button>
            )}
            {suggestions.map((tag) => (
              <button
                key={tag}
                onClick={() => handleApply(tag)}
                disabled={applying}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <Tag className="h-3.5 w-3.5 text-gray-400" />
                <span>{tag}</span>
              </button>
            ))}
            {suggestions.length === 0 && !showCreateOption && (
              <div className="px-2.5 py-2 text-sm text-gray-400">
                {mode === 'remove' ? 'No matching tags found' : 'No existing tags match'}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
          <button
            onClick={onClose}
            disabled={applying}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TagFilterDropdown({
  allTags,
  selectedTags,
  onToggleTag,
  onClearAll,
}: {
  allTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setTagSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filteredTags = useMemo(() => {
    if (!tagSearch) return allTags;
    const q = tagSearch.toLowerCase();
    return allTags.filter((tag) => tag.toLowerCase().includes(q));
  }, [allTags, tagSearch]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => { setOpen(!open); setTagSearch(''); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
        >
          <Tag className="h-3.5 w-3.5" />
          Filter by tag
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute left-0 z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 p-2">
              <SearchInput
                autoFocus
                value={tagSearch}
                onChange={setTagSearch}
                placeholder="Search tags..."
              />
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {filteredTags.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-400">No tags found</div>
              ) : (
                filteredTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => onToggleTag(tag)}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isSelected ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{tag}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      {selectedTags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-gray-900 py-0.5 pl-2.5 pr-1 text-xs font-medium text-white"
        >
          {tag}
          <button onClick={() => onToggleTag(tag)} className="rounded-full p-0.5 hover:bg-gray-700">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {selectedTags.length > 0 && (
        <button onClick={onClearAll} className="text-xs font-medium text-gray-500 hover:text-gray-700">
          Clear all
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default filter values
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS = {
  customerType: 'all' as string,
  visitStatus: 'all' as string,
  activity: 'all' as string,
  showArchived: false,
};

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function CustomersPage() {
  const router = useRouter();
  const supabase = createClient();
  const { granted: canViewCustomers, loading: viewLoading } = usePermission('customers.view');
  const { granted: canCreateCustomer } = usePermission('customers.create');
  const { granted: canEditCustomer } = usePermission('customers.edit');
  const { granted: canMergeCustomers } = usePermission('customers.merge');

  const table = useTableState({ defaultFilters: DEFAULT_FILTERS });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  // Tag filters managed locally — AND-logic multi-select doesn't fit toolbar's select type
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [openQuoteCustomerIds, setOpenQuoteCustomerIds] = useState<Set<string>>(new Set());
  const [pendingApptCustomerIds, setPendingApptCustomerIds] = useState<Set<string>>(new Set());

  // Bulk tag state
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'remove'>('add');
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagTargets, setBulkTagTargets] = useState<Customer[]>([]);

  // Convenience accessors
  const customerTypeFilter = (table.filters.customerType as string) || 'all';
  const visitStatusFilter = (table.filters.visitStatus as string) || 'all';
  const activityFilter = (table.filters.activity as string) || 'all';
  const showArchived = table.filters.showArchived === true;

  // Gather all unique tags from customers
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    customers.forEach((c) => {
      if (c.tags && Array.isArray(c.tags)) {
        c.tags.forEach((t) => tagSet.add(t));
      }
    });
    return Array.from(tagSet).sort();
  }, [customers]);

  async function handleBulkTag(tag: string) {
    const updates = bulkTagTargets.map((c) => {
      const currentTags = Array.isArray(c.tags) ? c.tags : [];
      const newTags =
        bulkTagMode === 'add'
          ? currentTags.includes(tag) ? currentTags : [...currentTags, tag]
          : currentTags.filter((t) => t !== tag);
      return { id: c.id, tags: newTags };
    });
    const promises = updates.map(({ id, tags }) =>
      supabase.from('customers').update({ tags }).eq('id', id)
    );
    await Promise.all(promises);
    setCustomers((prev) =>
      prev.map((c) => {
        const upd = updates.find((u) => u.id === c.id);
        return upd ? { ...c, tags: upd.tags } : c;
      })
    );
  }

  const bulkActions: BulkAction<Customer>[] = canEditCustomer
    ? [
        {
          label: 'Add Tag',
          onClick: (selected) => {
            setBulkTagTargets(selected);
            setBulkTagMode('add');
            setBulkTagOpen(true);
          },
        },
        {
          label: 'Remove Tag',
          onClick: (selected) => {
            setBulkTagTargets(selected);
            setBulkTagMode('remove');
            setBulkTagOpen(true);
          },
        },
      ]
    : [];

  useEffect(() => {
    async function load() {
      setLoading(true);
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      let custQuery = supabase.from('customers').select('*').order('first_name').limit(5000);
      if (!showArchived) {
        custQuery = custQuery.is('deleted_at', null);
      }
      const [custRes, quotesRes, apptsRes] = await Promise.all([
        custQuery,
        supabase.from('quotes').select('customer_id').in('status', ['draft', 'sent', 'viewed']).not('customer_id', 'is', null),
        // Phase 0a-2: walk-ins are 'in_progress' so the existing status
        // filter (pending/confirmed) already correctly scopes this to real
        // upcoming bookings. No channel filter needed.
        supabase.from('appointments').select('customer_id').gte('scheduled_date', todayStr).in('status', ['pending', 'confirmed']).not('customer_id', 'is', null),
      ]);

      if (custRes.error) console.error('Error loading customers:', custRes.error);
      if (custRes.data) setCustomers(custRes.data);
      if (quotesRes.data) setOpenQuoteCustomerIds(new Set(quotesRes.data.map((q: { customer_id: string }) => q.customer_id)));
      if (apptsRes.data) setPendingApptCustomerIds(new Set(apptsRes.data.map((a: { customer_id: string }) => a.customer_id)));

      setLoading(false);
    }
    load();
    fetchStats();
  }, [showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const result = customers.filter((c) => {
      // Text search (debounced)
      if (table.debouncedSearch) {
        const q = table.debouncedSearch.toLowerCase();
        const matchesName = `${c.first_name} ${c.last_name}`.toLowerCase().includes(q);
        const matchesPhone = c.phone?.includes(q) || formatPhone(c.phone || '').includes(q);
        const matchesEmail = c.email?.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesEmail) return false;
      }

      if (customerTypeFilter !== 'all') {
        if (customerTypeFilter === 'unset') {
          if (c.customer_type) return false;
        } else {
          if (c.customer_type !== customerTypeFilter) return false;
        }
      }

      if (visitStatusFilter !== 'all') {
        switch (visitStatusFilter) {
          case 'new': if (c.visit_count !== 0) return false; break;
          case 'returning': if (c.visit_count < 1 || c.visit_count > 5) return false; break;
          case 'loyal': if (c.visit_count < 6) return false; break;
          case 'inactive': if (!c.last_visit_date || c.last_visit_date > ninetyDaysAgo) return false; break;
        }
      }

      if (activityFilter === 'open_quotes') {
        if (!openQuoteCustomerIds.has(c.id)) return false;
      } else if (activityFilter === 'pending_appointments') {
        if (!pendingApptCustomerIds.has(c.id)) return false;
      }

      if (tagFilters.length > 0) {
        if (!c.tags || !Array.isArray(c.tags)) return false;
        if (!tagFilters.every((t) => c.tags!.includes(t))) return false;
      }

      return true;
    });

    return result;
  }, [customers, table.debouncedSearch, customerTypeFilter, visitStatusFilter, activityFilter, tagFilters, openQuoteCustomerIds, pendingApptCustomerIds]);

  interface CustomerStatsData {
    total: number;
    newThisMonth: number;
    repeatCount: number;
    repeatRate: number;
    lifetimeRevenue: number;
    avgPerCustomer: number;
    atRiskCount: number;
    uncategorizedCount: number;
  }

  const [stats, setStats] = useState<CustomerStatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  async function fetchStats() {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/admin/customers/stats');
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error('Error fetching customer stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }

  function handleAtRiskClick() {
    table.setFilter('visitStatus', visitStatusFilter === 'inactive' ? 'all' : 'inactive');
  }

  async function handleToggleCustomerType(id: string, current: Customer['customer_type']) {
    const next: Customer['customer_type'] = !current ? 'enthusiast' : current === 'enthusiast' ? 'professional' : null;
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, customer_type: next } : c));
    const { error } = await supabase.from('customers').update({ customer_type: next }).eq('id', id);
    if (error) {
      console.error('Error updating customer type:', error);
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, customer_type: current } : c));
    }
  }

  function handleUncategorizedClick() {
    table.setFilter('customerType', customerTypeFilter === 'unset' ? 'all' : 'unset');
  }

  // Toolbar config
  const toolbarFilters: FilterConfig[] = useMemo(() => [
    {
      key: 'customerType',
      label: 'Type',
      type: 'select',
      options: [
        { label: 'All Types', value: 'all' },
        { label: 'Enthusiast', value: 'enthusiast' },
        { label: 'Professional', value: 'professional' },
        { label: 'No Type Set', value: 'unset' },
      ],
    },
    {
      key: 'visitStatus',
      label: 'Visits',
      type: 'select',
      options: [
        { label: 'All Visits', value: 'all' },
        { label: 'New (0 visits)', value: 'new' },
        { label: 'Returning (1-5)', value: 'returning' },
        { label: 'Loyal (6+)', value: 'loyal' },
        { label: 'Inactive (90+ days)', value: 'inactive' },
      ],
    },
    {
      key: 'activity',
      label: 'Activity',
      type: 'select',
      options: [
        { label: 'All Activity', value: 'all' },
        { label: 'Open Quotes', value: 'open_quotes' },
        { label: 'Upcoming Appointments', value: 'pending_appointments' },
      ],
    },
    {
      key: 'showArchived',
      label: 'Show Archived',
      type: 'boolean-toggle',
    },
  ], []);

  // Quick filter chips removed — stat cards and dropdowns provide these filters directly

  const columns: ColumnDef<Customer, unknown>[] = [
    {
      id: 'phone',
      header: 'Phone',
      size: 140,
      accessorFn: (row) => row.phone || '',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            className={`text-left font-medium hover:underline ${row.original.deleted_at ? 'text-gray-400' : 'text-blue-600 hover:text-blue-800'}`}
            onClick={() => router.push(`/admin/customers/${row.original.id}`)}
          >
            {row.original.phone ? formatPhone(row.original.phone) : '--'}
          </button>
          {row.original.deleted_at && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Archived</Badge>
          )}
        </div>
      ),
    },
    {
      id: 'name',
      header: 'Name',
      size: 180,
      accessorFn: (row) => `${row.last_name} ${row.first_name}`,
      cell: ({ row }) => (
        <span className="text-sm text-gray-900">
          {row.original.first_name} {row.original.last_name}
        </span>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      size: 90,
      accessorFn: (row) => row.customer_type || '',
      cell: ({ row }) => {
        const t = row.original.customer_type;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleCustomerType(row.original.id, t);
            }}
            className="cursor-pointer"
            title="Click to change type"
          >
            <Badge
              variant={t === 'professional' ? 'info' : t === 'enthusiast' ? 'success' : 'secondary'}
              className="text-[10px] px-1.5 py-0 hover:opacity-80"
            >
              {t === 'professional' ? 'Professional' : t === 'enthusiast' ? 'Enthusiast' : 'Unknown'}
            </Badge>
          </button>
        );
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 truncate max-w-[180px] block">{row.original.email || '--'}</span>
      ),
    },
    {
      accessorKey: 'visit_count',
      header: 'Visits',
      size: 70,
      cell: ({ row }) => <span className="text-sm text-gray-600">{row.original.visit_count}</span>,
    },
    {
      accessorKey: 'lifetime_spend',
      header: 'Lifetime Spend',
      size: 110,
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">{formatCurrency(row.original.lifetime_spend)}</span>
      ),
    },
    {
      accessorKey: 'loyalty_points_balance',
      header: 'Points',
      size: 70,
      cell: ({ row }) => <span className="text-sm text-gray-600">{formatPoints(row.original.loyalty_points_balance)}</span>,
    },
    {
      id: 'last_visit',
      header: 'Last Visit',
      size: 90,
      accessorFn: (row) => row.last_visit_date || '',
      cell: ({ row }) => {
        const d = row.original.last_visit_date;
        if (!d) return <span className="text-sm text-gray-400">Never</span>;
        return (
          <span className="text-sm text-gray-500" title={new Date(d).toLocaleDateString()}>
            {formatRelativeDate(d)}
          </span>
        );
      },
    },
  ];

  if (viewLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!canViewCustomers) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-2 text-sm text-gray-500">You don&apos;t have permission to view customers.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description={`${customers.length} customers`}
        action={
          <div className="flex items-center gap-2">
            {canMergeCustomers && (
              <Link href="/admin/customers/duplicates">
                <Button variant="outline" size="sm">
                  <Users className="h-4 w-4" />
                  Review Duplicates
                </Button>
              </Link>
            )}
            {canCreateCustomer && (
              <Button onClick={() => router.push('/admin/customers/new')}>
                <Plus className="h-4 w-4" />
                Add Customer
              </Button>
            )}
          </div>
        }
      />

      <CustomerStats
        total={stats?.total ?? 0}
        newThisMonth={stats?.newThisMonth ?? 0}
        repeatCount={stats?.repeatCount ?? 0}
        repeatRate={stats?.repeatRate ?? 0}
        lifetimeRevenue={stats?.lifetimeRevenue ?? 0}
        avgPerCustomer={stats?.avgPerCustomer ?? 0}
        atRiskCount={stats?.atRiskCount ?? 0}
        uncategorizedCount={stats?.uncategorizedCount ?? 0}
        activeAtRiskFilter={visitStatusFilter === 'inactive'}
        activeUncategorizedFilter={customerTypeFilter === 'unset'}
        onAtRiskClick={handleAtRiskClick}
        onUncategorizedClick={handleUncategorizedClick}
        loading={statsLoading}
      />

      <TableToolbar
        state={table}
        defaultFilters={DEFAULT_FILTERS}
        config={{
          searchPlaceholder: 'Search by name, phone, or email...',
          filters: toolbarFilters,
        }}
      />

      {/* Tag filter — kept as inline JSX (AND-logic multi-select doesn't fit toolbar's select type) */}
      {allTags.length > 0 && (
        <TagFilterDropdown
          allTags={allTags}
          selectedTags={tagFilters}
          onToggleTag={(tag) =>
            setTagFilters((prev) =>
              prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
            )
          }
          onClearAll={() => setTagFilters([])}
        />
      )}

      <DataTable
        columns={columns}
        data={filtered}
        bulkActions={bulkActions}
        emptyTitle="No customers found"
        emptyDescription="Get started by adding your first customer."
        emptyAction={
          <Button onClick={() => router.push('/admin/customers/new')}>
            <Plus className="h-4 w-4" />
            Add Customer
          </Button>
        }
        initialSorting={table.sort ?? undefined}
        onSortingChange={table.setSort}
        initialPage={table.page}
        initialPageSize={table.pageSize}
        onPaginationChange={(page, size) => {
          table.setPage(page);
          if (size !== table.pageSize) table.setPageSize(size);
        }}
      />

      <BulkTagDialog
        open={bulkTagOpen}
        onClose={() => setBulkTagOpen(false)}
        mode={bulkTagMode}
        allTags={allTags}
        onApply={handleBulkTag}
      />
    </div>
  );
}
