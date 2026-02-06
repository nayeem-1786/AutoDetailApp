'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Customer } from '@/lib/supabase/types';
import { formatCurrency, formatPhone, formatDate, formatPoints } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Plus, Tag, X, Check, ChevronDown, Tags, Minus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { BulkAction } from '@/components/ui/data-table';

type SortOption = 'name' | 'last_visit' | 'spend';

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

  // Filter suggestions based on input
  const suggestions = useMemo(() => {
    if (!tagInput.trim()) return allTags;
    const q = tagInput.toLowerCase();
    return allTags.filter((t) => t.toLowerCase().includes(q));
  }, [allTags, tagInput]);

  // Show "create new" option when typing a tag that doesn't exist
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
                <span>
                  Create &quot;{tagInput.trim()}&quot;
                </span>
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

  // Close on click outside
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
      {/* Selected tag chips */}
      {selectedTags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-gray-900 py-0.5 pl-2.5 pr-1 text-xs font-medium text-white"
        >
          {tag}
          <button
            onClick={() => onToggleTag(tag)}
            className="rounded-full p-0.5 hover:bg-gray-700"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {/* Clear all */}
      {selectedTags.length > 0 && (
        <button
          onClick={onClearAll}
          className="text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          Clear all
        </button>
      )}

      {/* Dropdown trigger */}
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
            {/* Search input */}
            <div className="border-b border-gray-100 p-2">
              <input
                autoFocus
                type="text"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Search tags..."
                className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>

            {/* Tag list */}
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
                          isSelected
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-300'
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
    </div>
  );
}

export default function CustomersPage() {
  const router = useRouter();
  const supabase = createClient();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [tagFilters, setTagFilters] = useState<string[]>([]);

  // Bulk tag state
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'remove'>('add');
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagTargets, setBulkTagTargets] = useState<Customer[]>([]);

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

    // Update each customer in Supabase
    const promises = updates.map(({ id, tags }) =>
      supabase.from('customers').update({ tags }).eq('id', id)
    );
    await Promise.all(promises);

    // Update local state
    setCustomers((prev) =>
      prev.map((c) => {
        const upd = updates.find((u) => u.id === c.id);
        return upd ? { ...c, tags: upd.tags } : c;
      })
    );
  }

  const bulkActions: BulkAction<Customer>[] = [
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
  ];

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('first_name');

      if (error) {
        console.error('Error loading customers:', error);
      }
      if (data) setCustomers(data);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let result = customers.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesName = `${c.first_name} ${c.last_name}`.toLowerCase().includes(q);
        const matchesPhone = c.phone?.includes(q) || formatPhone(c.phone || '').includes(q);
        const matchesEmail = c.email?.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesEmail) return false;
      }
      if (tagFilters.length > 0) {
        if (!c.tags || !Array.isArray(c.tags)) return false;
        // AND logic: customer must have ALL selected tags
        if (!tagFilters.every((t) => c.tags!.includes(t))) return false;
      }
      return true;
    });

    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === 'name') {
        return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
      }
      if (sortBy === 'last_visit') {
        const dateA = a.last_visit_date || '';
        const dateB = b.last_visit_date || '';
        return dateB.localeCompare(dateA); // Most recent first
      }
      if (sortBy === 'spend') {
        return b.lifetime_spend - a.lifetime_spend; // Highest first
      }
      return 0;
    });

    return result;
  }, [customers, search, sortBy, tagFilters]);

  const columns: ColumnDef<Customer, unknown>[] = [
    {
      id: 'name',
      header: 'Name',
      accessorFn: (row) => `${row.first_name} ${row.last_name}`,
      cell: ({ row }) => (
        <button
          className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline"
          onClick={() => router.push(`/admin/customers/${row.original.id}`)}
        >
          {row.original.first_name} {row.original.last_name}
        </button>
      ),
    },
    {
      id: 'phone',
      header: 'Mobile',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.original.phone ? formatPhone(row.original.phone) : '--'}
        </span>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.original.email || '--'}</span>
      ),
    },
    {
      accessorKey: 'visit_count',
      header: 'Visits',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.original.visit_count}</span>
      ),
    },
    {
      accessorKey: 'lifetime_spend',
      header: 'Lifetime Spend',
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {formatCurrency(row.original.lifetime_spend)}
        </span>
      ),
    },
    {
      accessorKey: 'loyalty_points_balance',
      header: 'Points',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatPoints(row.original.loyalty_points_balance)}
        </span>
      ),
    },
    {
      id: 'last_visit',
      header: 'Last Visit',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.last_visit_date ? formatDate(row.original.last_visit_date) : 'Never'}
        </span>
      ),
    },
    {
      id: 'tags',
      header: 'Tags',
      cell: ({ row }) => {
        const tags = row.original.tags;
        if (!tags || !Array.isArray(tags) || tags.length === 0) return null;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="secondary">+{tags.length - 3}</Badge>
            )}
          </div>
        );
      },
      enableSorting: false,
    },
  ];

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
        title="Customers"
        description={`${customers.length} customers`}
        action={
          <Button onClick={() => router.push('/admin/customers/new')}>
            <Plus className="h-4 w-4" />
            Add Customer
          </Button>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, phone, or email..."
          className="w-full sm:w-72"
        />
        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="w-full sm:w-44"
        >
          <option value="name">Sort by Name</option>
          <option value="last_visit">Sort by Last Visit</option>
          <option value="spend">Sort by Spend</option>
        </Select>
      </div>

      {/* Tag filter dropdown + selected chips */}
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
