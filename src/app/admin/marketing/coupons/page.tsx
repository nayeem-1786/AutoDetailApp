'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
import { Info, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { adminFetch } from '@/lib/utils/admin-fetch';

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

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingAutoId, setTogglingAutoId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function toggleAutoApply(coupon: Coupon) {
    setTogglingAutoId(coupon.id);
    try {
      const res = await adminFetch(`/api/marketing/coupons/${coupon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_apply: !coupon.auto_apply }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setCoupons((prev) => prev.map((c) => (c.id === data.id ? { ...c, ...data } : c)));
        toast.success(`Auto-apply ${data.auto_apply ? 'enabled' : 'disabled'}`);
      } else {
        const { error } = await res.json();
        toast.error(error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update');
    } finally {
      setTogglingAutoId(null);
    }
  }

  async function toggleStatus(coupon: Coupon) {
    const newStatus = coupon.status === 'active' ? 'disabled' : 'active';
    setTogglingId(coupon.id);
    try {
      const res = await adminFetch(`/api/marketing/coupons/${coupon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setCoupons((prev) => prev.map((c) => (c.id === data.id ? { ...c, ...data } : c)));
        toast.success(`Coupon ${newStatus === 'active' ? 'enabled' : 'disabled'}`);
      } else {
        const { error } = await res.json();
        toast.error(error || 'Failed to update status');
      }
    } catch {
      toast.error('Failed to update status');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await adminFetch(`/api/marketing/coupons/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setCoupons((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        toast.success('Coupon deleted');
      } else {
        const { error } = await res.json();
        toast.error(error || 'Failed to delete coupon');
      }
    } catch {
      toast.error('Failed to delete coupon');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await adminFetch('/api/marketing/coupons?limit=1000');
        const json = await res.json();
        if (res.ok) {
          if (json.data) setCoupons(json.data);
        } else {
          console.error('Failed to load coupons:', res.status, json);
          toast.error(`Failed to load coupons: ${json.error || res.statusText}`);
        }
      } catch (err) {
        console.error('Failed to load coupons:', err);
        toast.error('Failed to load coupons');
      }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return coupons.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesCode = c.code.toLowerCase().includes(q);
        const matchesName = c.name?.toLowerCase().includes(q);
        if (!matchesCode && !matchesName) return false;
      }
      if (statusFilter === 'expired') {
        if (!isExpired(c)) return false;
      } else if (statusFilter) {
        if (isExpired(c) || c.status !== statusFilter) return false;
      }
      return true;
    });
  }, [coupons, search, statusFilter]);

  function isExpired(coupon: Coupon): boolean {
    return !!coupon.expires_at && new Date(coupon.expires_at) < new Date();
  }

  function statusBadge(coupon: Coupon) {
    if (isExpired(coupon)) {
      return <Badge variant="warning">Expired</Badge>;
    }
    const variant =
      coupon.status === 'active' ? 'success' :
      coupon.status === 'disabled' ? 'destructive' :
      coupon.status === 'draft' ? 'default' :
      'secondary';
    return <Badge variant={variant}>{COUPON_STATUS_LABELS[coupon.status] || coupon.status}</Badge>;
  }

  const columns: ColumnDef<Coupon, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      size: 175,
      cell: ({ row }) => {
        const c = row.original;
        const href = c.status === 'draft'
          ? `/admin/marketing/coupons/new?edit=${c.id}`
          : `/admin/marketing/coupons/${c.id}`;
        return (
          <button
            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
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
      size: 175,
      cell: ({ row }) => (
        row.original.code
          ? <span className="font-mono text-sm text-gray-700">{row.original.code}</span>
          : <span className="text-xs text-gray-400 italic">Auto-Generated</span>
      ),
    },
    {
      id: 'discount',
      header: () => <div className="text-center w-full">Discount</div>,
      size: 130,
      cell: ({ row }) => {
        const summary = discountSummary(row.original);
        if (summary === '--') return <div className="text-center"><span className="text-sm text-gray-400">--</span></div>;
        return <div className="text-center"><Badge variant="info">{summary}</Badge></div>;
      },
      enableSorting: false,
    },
    {
      id: 'status',
      size: 130,
      header: () => (
        <div className="flex items-center justify-center gap-1 w-full">
          <span>Status</span>
          <div className="group relative">
            <Info className="h-3.5 w-3.5 cursor-help text-gray-400" />
            <div className="pointer-events-none absolute top-full left-0 z-20 mt-1.5 w-48 rounded-md bg-gray-900 px-3 py-2 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Click a status badge to toggle between Active and Disabled.
              <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900" />
            </div>
          </div>
        </div>
      ),
      cell: ({ row }) => {
        const c = row.original;
        const canToggle = !isExpired(c) && (c.status === 'active' || c.status === 'disabled');
        if (!canToggle) return <div className="text-center">{statusBadge(c)}</div>;
        return (
          <div className="text-center">
            <button
              type="button"
              disabled={togglingId === c.id}
              onClick={(e) => { e.stopPropagation(); toggleStatus(c); }}
              className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              title={c.status === 'active' ? 'Click to disable' : 'Click to enable'}
            >
              {statusBadge(c)}
            </button>
          </div>
        );
      },
      enableSorting: false,
    },
    {
      id: 'auto',
      size: 130,
      header: () => (
        <div className="flex items-center justify-center gap-1 w-full">
          <span>Auto-Apply</span>
          <div className="group relative">
            <Info className="h-3.5 w-3.5 cursor-help text-gray-400" />
            <div className="pointer-events-none absolute top-full left-0 z-20 mt-1.5 w-52 rounded-md bg-gray-900 px-3 py-2 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              When on, this coupon applies automatically at the POS when conditions are met.
              <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900" />
            </div>
          </div>
        </div>
      ),
      cell: ({ row }) => {
        const c = row.original;
        if (c.status === 'draft' || isExpired(c)) {
          return <div className="text-center">{c.auto_apply
            ? <Badge variant="info">On</Badge>
            : <span className="text-sm text-gray-400">Off</span>}</div>;
        }
        return (
          <div className="text-center">
            <button
              type="button"
              disabled={togglingAutoId === c.id}
              onClick={(e) => { e.stopPropagation(); toggleAutoApply(c); }}
              className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              title={c.auto_apply ? 'Click to turn off auto-apply' : 'Click to turn on auto-apply'}
            >
              {c.auto_apply
                ? <Badge variant="info">On</Badge>
                : <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">Off</span>}
            </button>
          </div>
        );
      },
      enableSorting: false,
    },
    {
      id: 'uses',
      header: () => <div className="text-center w-full">Used / Limit</div>,
      size: 140,
      cell: ({ row }) => (
        <div className="text-center text-sm text-gray-600">
          {row.original.use_count} / {row.original.max_uses ?? '∞'}
        </div>
      ),
    },
    {
      id: 'expires',
      header: 'Expires',
      size: 130,
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.expires_at ? formatDate(row.original.expires_at) : 'Never'}
        </span>
      ),
    },
    {
      id: 'delete',
      header: '',
      size: 50,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteTarget(row.original);
          }}
          className="text-gray-400 hover:text-red-600"
          title="Delete coupon"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Coupon"
        description={`Are you sure you want to delete "${deleteTarget?.name || deleteTarget?.code}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
