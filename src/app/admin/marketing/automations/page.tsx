'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CAMPAIGN_CHANNEL_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { adminFetch } from '@/lib/utils/admin-fetch';

interface RuleWithService {
  id: string;
  name: string;
  description: string | null;
  trigger_condition: string;
  delay_days: number;
  delay_minutes: number;
  action: string;
  is_active: boolean;
  chain_order: number;
  created_at: string;
  services: { id: string; name: string } | null;
  coupons: { id: string; name: string | null; code: string } | null;
}

export default function AutomationsListPage() {
  const router = useRouter();

  const [rules, setRules] = useState<RuleWithService[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('');

  useEffect(() => {
    async function loadRules() {
      setLoading(true);
      try {
        const res = await adminFetch('/api/marketing/automations', { cache: 'no-store' });
        if (res.ok) {
          const { data } = await res.json();
          if (data) setRules(data);
        } else {
          toast.error('Failed to load automation rules');
        }
      } catch {
        toast.error('Failed to load automation rules');
      }
      setLoading(false);
    }
    loadRules();
  }, []);

  async function toggleActive(ruleId: string, isActive: boolean) {
    try {
      const res = await adminFetch(`/api/marketing/automations/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setRules((prev) =>
          prev.map((r) => (r.id === data.id ? { ...r, ...data } : r))
        );
        toast.success(`Rule ${!isActive ? 'activated' : 'deactivated'}`);
      } else {
        toast.error('Failed to update rule');
      }
    } catch {
      toast.error('Failed to update rule');
    }
  }

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (activeFilter === 'active' && !r.is_active) return false;
      if (activeFilter === 'inactive' && r.is_active) return false;
      return true;
    });
  }, [rules, activeFilter]);

  const columns: ColumnDef<RuleWithService, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <button
          className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline"
          onClick={() => router.push(`/admin/marketing/automations/${row.original.id}`)}
        >
          {row.original.name}
        </button>
      ),
    },
    {
      id: 'trigger',
      header: 'Trigger',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.original.trigger_condition.replace(/_/g, ' ')}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'delay_days',
      header: 'Delay',
      cell: ({ row }) => {
        const days = row.original.delay_days;
        const mins = row.original.delay_minutes || 0;
        if (days === 0 && mins === 0) return 'Immediate';
        const parts: string[] = [];
        if (days > 0) parts.push(`${days}d`);
        if (mins > 0) parts.push(`${mins}m`);
        return parts.join(' ');
      },
    },
    {
      id: 'action',
      header: 'Action',
      cell: ({ row }) => (
        <Badge variant="info">
          {CAMPAIGN_CHANNEL_LABELS[row.original.action] || row.original.action}
        </Badge>
      ),
      enableSorting: false,
    },
    {
      id: 'service',
      header: 'Service',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.services?.name || 'Any'}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'coupon',
      header: 'Coupon',
      cell: ({ row }) => {
        const coupon = row.original.coupons;
        if (!coupon) return <span className="text-sm text-gray-400">—</span>;
        return (
          <span className="text-sm text-gray-600">
            {coupon.name || coupon.code}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      id: 'active',
      header: 'Active',
      cell: ({ row }) => (
        <Switch
          checked={row.original.is_active}
          onCheckedChange={() => toggleActive(row.original.id, row.original.is_active)}
        />
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
        title="Automations"
        description={`${rules.length} lifecycle rules`}
        action={
          <Button onClick={() => router.push('/admin/marketing/automations/new')}>
            <Plus className="h-4 w-4" />
            Create Rule
          </Button>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="w-full sm:w-40"
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No automation rules"
        emptyDescription="Create lifecycle rules to automatically engage customers."
        emptyAction={
          <Button onClick={() => router.push('/admin/marketing/automations/new')}>
            <Plus className="h-4 w-4" />
            Create Rule
          </Button>
        }
      />
    </div>
  );
}
