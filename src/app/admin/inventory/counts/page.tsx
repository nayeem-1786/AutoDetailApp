'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { usePermission } from '@/lib/hooks/use-permission';
import { formatDate } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DataTable } from '@/components/ui/data-table';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import type { ColumnDef } from '@tanstack/react-table';

type CountStatus = 'active' | 'review' | 'committed' | 'cancelled';
type CountType = 'full' | 'sectional';

interface EmployeeRef {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface StockCountRow {
  id: string;
  status: CountStatus;
  count_type: CountType;
  section_label: string | null;
  notes: string | null;
  started_at: string;
  committed_at: string | null;
  cancelled_at: string | null;
  started_by_employee: EmployeeRef | null;
  items_count: number;
}

const STATUS_LABELS: Record<CountStatus, string> = {
  active: 'Active',
  review: 'Review',
  committed: 'Committed',
  cancelled: 'Cancelled',
};

const STATUS_VARIANTS: Record<CountStatus, 'info' | 'warning' | 'success' | 'secondary'> = {
  active: 'info',
  review: 'warning',
  committed: 'success',
  cancelled: 'secondary',
};

const TYPE_LABELS: Record<CountType, string> = {
  full: 'Full Store',
  sectional: 'Sectional',
};

export default function InventoryCountsPage() {
  const router = useRouter();
  const { granted: canManage } = usePermission('inventory.counts.manage');
  const [counts, setCounts] = useState<StockCountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'' | CountStatus>('');

  // New-count modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [newType, setNewType] = useState<CountType>('sectional');
  const [newLabel, setNewLabel] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  async function loadCounts() {
    setLoading(true);
    try {
      const url = statusFilter
        ? `/api/admin/inventory/counts?status=${statusFilter}`
        : '/api/admin/inventory/counts';
      const res = await adminFetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setCounts(json.counts ?? []);
    } catch (err) {
      console.error('Load counts error:', err);
      toast.error('Failed to load counts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function openNewModal() {
    setNewType('sectional');
    setNewLabel('');
    setNewNotes('');
    setModalOpen(true);
  }

  async function handleCreate(e?: React.FormEvent) {
    e?.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const res = await adminFetch('/api/admin/inventory/counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count_type: newType,
          section_label: newLabel.trim() || null,
          notes: newNotes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create');
      toast.success('Count started');
      setModalOpen(false);
      router.push(`/admin/inventory/counts/${json.count.id}`);
    } catch (err) {
      console.error('Create count error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create count');
    } finally {
      setCreating(false);
    }
  }

  const columns: ColumnDef<StockCountRow, unknown>[] = [
    {
      accessorKey: 'started_at',
      header: 'Started',
      size: 130,
      cell: ({ row }) => formatDate(row.original.started_at),
    },
    {
      id: 'count_type',
      header: 'Type',
      size: 110,
      cell: ({ row }) => (
        <Badge variant={row.original.count_type === 'full' ? 'info' : 'secondary'}>
          {TYPE_LABELS[row.original.count_type]}
        </Badge>
      ),
      enableSorting: false,
    },
    {
      id: 'section_label',
      header: 'Section',
      cell: ({ row }) => {
        const label =
          row.original.section_label ||
          (row.original.count_type === 'full'
            ? 'Full Store'
            : `Section — ${formatDate(row.original.started_at)}`);
        return (
          <button
            className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline"
            onClick={() => router.push(`/admin/inventory/counts/${row.original.id}`)}
          >
            {label}
          </button>
        );
      },
    },
    {
      id: 'started_by',
      header: 'Started By',
      cell: ({ row }) => {
        const emp = row.original.started_by_employee;
        return emp ? `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim() || '--' : '--';
      },
      enableSorting: false,
    },
    {
      id: 'status',
      header: 'Status',
      size: 110,
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.original.status]}>
          {STATUS_LABELS[row.original.status]}
        </Badge>
      ),
      enableSorting: false,
    },
    {
      id: 'items_count',
      header: 'Items',
      size: 80,
      cell: ({ row }) => row.original.items_count,
      enableSorting: false,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Counts"
        description="Physical count sessions with variance review and batch commit"
        action={
          canManage ? (
            <Button onClick={openNewModal}>
              <Plus className="h-4 w-4" />
              New Count
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | CountStatus)}
          className="w-full sm:w-44"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="review">Review</option>
          <option value="committed">Committed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={counts}
          emptyTitle="No counts yet"
          emptyDescription="Start a count to log physical inventory."
          emptyAction={
            canManage ? (
              <Button onClick={openNewModal}>
                <Plus className="h-4 w-4" />
                New Count
              </Button>
            ) : undefined
          }
        />
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogHeader>
          <DialogTitle>New Inventory Count</DialogTitle>
          <DialogDescription>
            Start a count session. Scan products to log quantities, then review
            variances before committing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate}>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-ui-text">
                Count Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-ui-text">
                  <input
                    type="radio"
                    name="count_type"
                    value="sectional"
                    checked={newType === 'sectional'}
                    onChange={() => setNewType('sectional')}
                  />
                  Sectional
                </label>
                <label className="flex items-center gap-2 text-sm text-ui-text">
                  <input
                    type="radio"
                    name="count_type"
                    value="full"
                    checked={newType === 'full'}
                    onChange={() => setNewType('full')}
                  />
                  Full Store
                </label>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-ui-text">
                Section Label {newType === 'sectional' && <span className="text-ui-text-muted">(e.g., &quot;Shelf A1-A5&quot;)</span>}
              </label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={newType === 'full' ? 'e.g., Full Store — March 2026' : 'e.g., Back room, tier 1'}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-ui-text">
                Notes <span className="text-ui-text-muted">(optional)</span>
              </label>
              <Textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={3}
                placeholder="Any context for this count..."
              />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setModalOpen(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={creating}>
            {creating ? 'Starting…' : 'Start Count'}
          </Button>
        </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
