'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Coupon } from '@/lib/supabase/types';
import { formatDate } from '@/lib/utils/format';
import { COUPON_STATUS_LABELS, DISCOUNT_TYPE_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

function discountSummary(coupon: Coupon): string {
  const rewards = (coupon as any).coupon_rewards || coupon.rewards || [];
  if (rewards.length === 0) return '--';
  return rewards.map((r: any) => {
    if (r.discount_type === 'free') return 'Free';
    if (r.discount_type === 'percentage') return `${r.discount_value}% off`;
    return `$${r.discount_value} off`;
  }).join(' + ');
}

export default function CouponsListPage() {
  const router = useRouter();
  const supabase = createClient();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('coupons')
        .select('*, coupon_rewards(*)')
        .order('created_at', { ascending: false });

      if (data) setCoupons(data);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return coupons.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesCode = c.code.toLowerCase().includes(q);
        const matchesName = c.name?.toLowerCase().includes(q);
        if (!matchesCode && !matchesName) return false;
      }
      if (statusFilter && c.status !== statusFilter) return false;
      return true;
    });
  }, [coupons, search, statusFilter]);

  function statusBadge(status: string) {
    const variant =
      status === 'active' ? 'success' :
      status === 'disabled' ? 'destructive' :
      status === 'expired' ? 'warning' :
      status === 'draft' ? 'default' :
      'secondary';
    return <Badge variant={variant}>{COUPON_STATUS_LABELS[status] || status}</Badge>;
  }

  const columns: ColumnDef<Coupon, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const c = row.original;
        const href = c.status === 'draft'
          ? `/admin/marketing/coupons/new?edit=${c.id}`
          : `/admin/marketing/coupons/${c.id}`;
        return (
          <button
            className="text-sm font-medium text-gray-900 hover:text-blue-600"
            onClick={() => router.push(href)}
          >
            {c.name || 'Untitled'}
          </button>
        );
      },
    },
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => (
        <span className="font-mono text-sm text-gray-700">
          {row.original.code}
        </span>
      ),
    },
    {
      id: 'discount',
      header: 'Discount',
      cell: ({ row }) => {
        const summary = discountSummary(row.original);
        if (summary === '--') return <span className="text-sm text-gray-400">--</span>;
        return <Badge variant="info">{summary}</Badge>;
      },
      enableSorting: false,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => statusBadge(row.original.status),
      enableSorting: false,
    },
    {
      id: 'uses',
      header: 'Uses',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.original.use_count}{row.original.max_uses ? ` / ${row.original.max_uses}` : ''}
        </span>
      ),
    },
    {
      id: 'expires',
      header: 'Expires',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.expires_at ? formatDate(row.original.expires_at) : 'Never'}
        </span>
      ),
    },
    {
      id: 'auto',
      header: 'Auto',
      cell: ({ row }) =>
        row.original.auto_apply ? (
          <Badge variant="info">Auto</Badge>
        ) : null,
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
        title="Coupons"
        description={`${coupons.length} coupon${coupons.length === 1 ? '' : 's'} total`}
        action={
          <Button onClick={() => router.push('/admin/marketing/coupons/new')}>
            <Plus className="h-4 w-4" />
            Create Coupon
          </Button>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or code..."
          className="w-full sm:w-64"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-40"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="redeemed">Redeemed</option>
          <option value="expired">Expired</option>
          <option value="disabled">Disabled</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No coupons found"
        emptyDescription="Create your first coupon to get started."
        emptyAction={
          <Button onClick={() => router.push('/admin/marketing/coupons/new')}>
            <Plus className="h-4 w-4" />
            Create Coupon
          </Button>
        }
      />
    </div>
  );
}
