'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { adminFetch } from '@/lib/utils/admin-fetch';

// ─── Types ────────────────────────────────────────────────────────

interface DripSequenceRow {
  id: string;
  name: string;
  description: string | null;
  trigger_condition: string;
  is_active: boolean;
  active_enrollments: number;
  created_at: string;
}

// ─── Trigger labels ───────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  no_visit_days: 'No Visit',
  after_service: 'After Service',
  new_customer: 'New Customer',
  manual_enroll: 'Manual',
  tag_added: 'Tag Added',
};

const TRIGGER_VARIANTS: Record<string, 'default' | 'success' | 'info' | 'warning' | 'destructive' | 'secondary'> = {
  no_visit_days: 'warning',
  after_service: 'info',
  new_customer: 'success',
  manual_enroll: 'secondary',
  tag_added: 'default',
};

// ─── Props ────────────────────────────────────────────────────────

interface CampaignTabsProps {
  oneTimeContent: React.ReactNode;
}

export function CampaignTabs({ oneTimeContent }: CampaignTabsProps) {
  const router = useRouter();
  const [tab, setTab] = useState('one-time');
  const [sequences, setSequences] = useState<DripSequenceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DripSequenceRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Load drip sequences when the drip tab is first selected
  useEffect(() => {
    if (tab === 'drip' && !loaded) {
      loadSequences();
    }
  }, [tab, loaded]);

  async function loadSequences() {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/drip-sequences', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.data) setSequences(json.data);
      } else {
        toast.error('Failed to load drip sequences');
      }
    } catch {
      toast.error('Failed to load drip sequences');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  async function handleToggleActive(seq: DripSequenceRow) {
    setTogglingIds((prev) => new Set(prev).add(seq.id));
    try {
      const res = await adminFetch(`/api/admin/drip-sequences/${seq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !seq.is_active }),
      });

      if (res.ok) {
        setSequences((prev) =>
          prev.map((s) => (s.id === seq.id ? { ...s, is_active: !s.is_active } : s))
        );
        toast.success(`Sequence ${seq.is_active ? 'deactivated' : 'activated'}`);
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to update sequence');
      }
    } catch {
      toast.error('Failed to update sequence');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(seq.id);
        return next;
      });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await adminFetch(`/api/admin/drip-sequences/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSequences((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        toast.success('Sequence deleted');
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to delete sequence');
      }
    } catch {
      toast.error('Failed to delete sequence');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const columns: ColumnDef<DripSequenceRow, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        size: 280,
        cell: ({ row }) => (
          <Link
            href={`/admin/marketing/campaigns/drip/${row.original.id}`}
            className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'trigger',
        header: 'Trigger',
        size: 140,
        cell: ({ row }) => (
          <Badge variant={TRIGGER_VARIANTS[row.original.trigger_condition] || 'default'}>
            {TRIGGER_LABELS[row.original.trigger_condition] || row.original.trigger_condition}
          </Badge>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'active_enrollments',
        header: 'Active Enrollments',
        size: 140,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.active_enrollments}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        size: 100,
        cell: ({ row }) => (
          <Switch
            checked={row.original.is_active}
            onCheckedChange={() => handleToggleActive(row.original)}
            disabled={togglingIds.has(row.original.id)}
          />
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: '',
        size: 120,
        cell: ({ row }) => {
          const seq = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/admin/marketing/campaigns/drip/${seq.id}`);
                }}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(seq);
                }}
                className="text-gray-400 hover:text-red-600"
                title="Delete sequence"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    [router, togglingIds]
  );

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="one-time">One-Time</TabsTrigger>
        <TabsTrigger value="drip">Drip</TabsTrigger>
      </TabsList>

      <TabsContent value="one-time">{oneTimeContent}</TabsContent>

      <TabsContent value="drip">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ui-text-muted">
              {sequences.length} sequence{sequences.length !== 1 ? 's' : ''} total
            </p>
            <Button onClick={() => router.push('/admin/marketing/campaigns/drip/new')}>
              <Plus className="h-4 w-4" />
              Create Sequence
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={sequences}
              emptyTitle="No drip sequences yet"
              emptyDescription="Create your first automated drip sequence."
              emptyAction={
                <Button onClick={() => router.push('/admin/marketing/campaigns/drip/new')}>
                  <Plus className="h-4 w-4" />
                  Create Sequence
                </Button>
              }
            />
          )}
        </div>

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title="Delete Sequence"
          description={`Are you sure you want to delete "${deleteTarget?.name}"? This will cancel all active enrollments and cannot be undone.`}
          confirmLabel="Delete"
          variant="destructive"
          loading={deleting}
          onConfirm={handleDelete}
        />
      </TabsContent>
    </Tabs>
  );
}
