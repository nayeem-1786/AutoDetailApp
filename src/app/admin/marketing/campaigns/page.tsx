'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Campaign } from '@/lib/supabase/types';
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_CHANNEL_LABELS } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Plus, Pencil } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

export default function CampaignsListPage() {
  const router = useRouter();
  const supabase = createClient();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) setCampaigns(data);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (channelFilter && c.channel !== channelFilter) return false;
      return true;
    });
  }, [campaigns, statusFilter, channelFilter]);

  function statusBadge(status: string) {
    const variant = status === 'sent' ? 'success' : status === 'draft' ? 'secondary' : status === 'scheduled' ? 'info' : status === 'sending' ? 'warning' : status === 'cancelled' ? 'destructive' : 'default';
    return <Badge variant={variant}>{CAMPAIGN_STATUS_LABELS[status] || status}</Badge>;
  }

  const columns: ColumnDef<Campaign, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <button
          className="text-left font-medium text-gray-900 hover:text-blue-600"
          onClick={() => router.push(`/admin/marketing/campaigns/${row.original.id}`)}
        >
          {row.original.name}
        </button>
      ),
    },
    {
      id: 'channel',
      header: 'Channel',
      cell: ({ row }) => (
        <Badge variant="info">
          {CAMPAIGN_CHANNEL_LABELS[row.original.channel] || row.original.channel}
        </Badge>
      ),
      enableSorting: false,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => statusBadge(row.original.status),
      enableSorting: false,
    },
    {
      accessorKey: 'recipient_count',
      header: 'Recipients',
    },
    {
      accessorKey: 'delivered_count',
      header: 'Delivered',
    },
    {
      id: 'sent_at',
      header: 'Sent',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.sent_at ? formatDate(row.original.sent_at) : '--'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        ['draft', 'scheduled'].includes(row.original.status) ? (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/admin/marketing/campaigns/${row.original.id}/edit`);
            }}
          >
            <Pencil className="h-3 w-3" />
            {row.original.status === 'draft' ? 'Resume' : 'Edit'}
          </Button>
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
        title="Campaigns"
        description={`${campaigns.length} campaigns total`}
        action={
          <Button onClick={() => router.push('/admin/marketing/campaigns/new')}>
            <Plus className="h-4 w-4" />
            Create Campaign
          </Button>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-40"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="sent">Sent</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="w-full sm:w-40"
        >
          <option value="">All Channels</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
          <option value="both">SMS + Email</option>
        </Select>
      </div>

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
      />
    </div>
  );
}
