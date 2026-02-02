'use client';

import { useEffect, useState, useMemo } from 'react';
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
import { Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

type SortOption = 'name' | 'last_visit' | 'spend';

export default function CustomersPage() {
  const router = useRouter();
  const supabase = createClient();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [tagFilter, setTagFilter] = useState('');

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
      if (tagFilter) {
        if (!c.tags || !Array.isArray(c.tags) || !c.tags.includes(tagFilter)) return false;
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
  }, [customers, search, sortBy, tagFilter]);

  const columns: ColumnDef<Customer, unknown>[] = [
    {
      id: 'name',
      header: 'Name',
      accessorFn: (row) => `${row.first_name} ${row.last_name}`,
      cell: ({ row }) => (
        <button
          className="text-left font-medium text-gray-900 hover:text-blue-600"
          onClick={() => router.push(`/admin/customers/${row.original.id}`)}
        >
          {row.original.first_name} {row.original.last_name}
        </button>
      ),
    },
    {
      id: 'phone',
      header: 'Phone',
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
        <Select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">All Tags</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No customers found"
        emptyDescription="Get started by adding your first customer."
        emptyAction={
          <Button onClick={() => router.push('/admin/customers/new')}>
            <Plus className="h-4 w-4" />
            Add Customer
          </Button>
        }
      />
    </div>
  );
}
