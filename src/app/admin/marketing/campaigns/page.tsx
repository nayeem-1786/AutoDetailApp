'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Campaign } from '@/lib/supabase/types';
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_CHANNEL_LABELS } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Plus, Pencil, Trash2, Copy } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { CampaignTabs } from './_components/campaign-tabs';
import { usePermission } from '@/lib/hooks/use-permission';
import { TableToolbar, type FilterConfig } from '@/components/admin/table-toolbar';
import { useTableState } from '@/lib/hooks/useTableState';

const DEFAULT_FILTERS = {
  status: '' as string,
  channel: '' as string,
};

export default function CampaignsListPage() {
  const router = useRouter();
  const { granted: canManageCampaigns, loading: permLoading } = usePermission('marketing.campaigns');

  const table = useTableState({ defaultFilters: DEFAULT_FILTERS });

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  const statusFilter = (table.filters.status as string) || '';
  const channelFilter = (table.filters.channel as string) || '';

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await adminFetch('/api/marketing/campaigns?limit=1000', { cache: 'no-store' });
        if (res.ok) {
          const { data } = await res.json();
          if (data) setCampaigns(data);
        }
      } catch (err) {
        console.error('Failed to load campaigns:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (channelFilter && c.channel !== channelFilter) return false;
      if (table.debouncedSearch) {
        const q = table.debouncedSearch.toLowerCase();
        if (!c.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [campaigns, statusFilter, channelFilter, table.debouncedSearch]);

  function statusBadge(status: string) {
    const variant = status === 'sent' ? 'success' : status === 'draft' ? 'secondary' : status === 'scheduled' ? 'info' : status === 'sending' ? 'warning' : status === 'cancelled' ? 'destructive' : 'default';
    return <Badge variant={variant}>{CAMPAIGN_STATUS_LABELS[status] || status}</Badge>;
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await adminFetch(`/api/marketing/campaigns/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        toast.success('Campaign deleted');
      } else {
        const { error } = await res.json();
        toast.error(error || 'Failed to delete campaign');
      }
    } catch {
      toast.error('Failed to delete campaign');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function handleDuplicate(campaignId: string) {
    setDuplicating(campaignId);
    try {
      const res = await adminFetch(`/api/marketing/campaigns/${campaignId}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const { data } = await res.json();
        toast.success('Campaign duplicated');
        router.push(`/admin/marketing/campaigns/${data.id}/edit`);
      } else {
        const { error } = await res.json();
        toast.error(error || 'Failed to duplicate campaign');
      }
    } catch {
      toast.error('Failed to duplicate campaign');
    } finally {
      setDuplicating(null);
    }
  }

  const toolbarFilters: FilterConfig[] = useMemo(() => [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { label: 'All Statuses', value: '' },
        { label: 'Draft', value: 'draft' },
        { label: 'Scheduled', value: 'scheduled' },
        { label: 'Sent', value: 'sent' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
    },
    {
      key: 'channel',
      label: 'Channel',
      type: 'select',
      options: [
        { label: 'All Channels', value: '' },
        { label: 'SMS', value: 'sms' },
        { label: 'Email', value: 'email' },
        { label: 'SMS + Email', value: 'both' },
      ],
    },
  ], []);

  const columns: ColumnDef<Campaign, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      size: 320,
      cell: ({ row }) => (
        <button
          className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline"
          onClick={() => router.push(`/admin/marketing/campaigns/${row.original.id}`)}
        >
          {row.original.name}
        </button>
      ),
    },
    {
      id: 'channel',
      header: 'Channel',
      size: 100,
      accessorFn: (row) => row.channel,
      cell: ({ row }) => (
        <Badge variant="info">
          {CAMPAIGN_CHANNEL_LABELS[row.original.channel] || row.original.channel}
        </Badge>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      size: 100,
      accessorFn: (row) => row.status,
      cell: ({ row }) => statusBadge(row.original.status),
    },
    {
      accessorKey: 'recipient_count',
      header: 'Recipients',
      size: 100,
    },
    {
      accessorKey: 'delivered_count',
      header: 'Delivered',
      size: 100,
    },
    {
      id: 'sent_at',
      header: 'Sent',
      size: 120,
      accessorFn: (row) => row.sent_at || '',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.sent_at ? formatDate(row.original.sent_at) : '--'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      size: 140,
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            {['draft', 'scheduled'].includes(c.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/admin/marketing/campaigns/${c.id}/edit`);
                }}
              >
                <Pencil className="h-3 w-3" />
                {c.status === 'draft' ? 'Resume' : 'Edit'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDuplicate(c.id);
              }}
              className="text-gray-400 hover:text-blue-600"
              title="Duplicate campaign"
              disabled={duplicating === c.id}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(c);
              }}
              className="text-gray-400 hover:text-red-600"
              title="Delete campaign"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
      enableSorting: false,
    },
  ];

  if (loading || permLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!canManageCampaigns) {
    return (
      <div>
        <PageHeader title="Campaigns" />
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <p className="text-lg font-medium text-gray-900">Access Denied</p>
          <p className="mt-1 text-sm text-gray-500">You do not have permission to manage campaigns.</p>
        </div>
      </div>
    );
  }

  const oneTimeContent = (
    <div className="space-y-6">
      <TableToolbar
        state={table}
        defaultFilters={DEFAULT_FILTERS}
        config={{
          searchPlaceholder: 'Search campaigns...',
          filters: toolbarFilters,
        }}
      />

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No campaigns yet"
        emptyDescription="Create your first marketing campaign."
        emptyAction={
          <Button onClick={() => router.push('/admin/marketing/campaigns/new')}>
            <Plus className="h-4 w-4" />
            Create Campaign
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Campaign"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description={`${campaigns.length} campaigns total`}
        action={
          <Button onClick={() => router.push('/admin/marketing/campaigns/new')}>
            <Plus className="h-4 w-4" />
            Create Campaign
          </Button>
        }
      />

      <CampaignTabs oneTimeContent={oneTimeContent} />
    </div>
  );
}
