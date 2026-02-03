'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable } from '@/components/ui/data-table';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

interface AuditLogEntry {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
}

export default function AuditLogPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tableExists, setTableExists] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        // Table doesn't exist or other error - show placeholder
        console.error('Audit log query error:', error);
        setTableExists(false);
        setLoading(false);
        return;
      }

      if (data) {
        setEntries(data as AuditLogEntry[]);
      }
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((entry) => {
      const matchesAction = entry.action?.toLowerCase().includes(q);
      const matchesUser = entry.user_email?.toLowerCase().includes(q);
      const matchesEntity = entry.entity_type?.toLowerCase().includes(q);
      const matchesDetails = entry.details
        ? JSON.stringify(entry.details).toLowerCase().includes(q)
        : false;
      return matchesAction || matchesUser || matchesEntity || matchesDetails;
    });
  }, [entries, search]);

  const columns: ColumnDef<AuditLogEntry, unknown>[] = [
    {
      id: 'date',
      header: 'Date',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-gray-600">
          {formatDateTime(row.original.created_at)}
        </span>
      ),
    },
    {
      id: 'user',
      header: 'User',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.original.user_email || row.original.user_id || '--'}
        </span>
      ),
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {row.original.action}
        </span>
      ),
    },
    {
      id: 'entity',
      header: 'Entity',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {[row.original.entity_type, row.original.entity_id]
            .filter(Boolean)
            .join(' / ') || '--'}
        </span>
      ),
    },
    {
      id: 'details',
      header: 'Details',
      cell: ({ row }) => {
        if (!row.original.details) return <span className="text-sm text-gray-400">--</span>;
        const text = JSON.stringify(row.original.details);
        return (
          <span className="block max-w-xs truncate text-sm text-gray-500" title={text}>
            {text}
          </span>
        );
      },
      enableSorting: false,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Audit Log"
          description="System activity history"
        />
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (!tableExists) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Audit Log"
          description="System activity history"
        />
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ClipboardList}
              title="Audit log not available"
              description="Audit log will be available once system logging is configured."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description={`System activity history — ${entries.length} entries`}
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by action, user, entity, or details..."
        className="w-full sm:w-96"
      />

      <DataTable
        columns={columns}
        data={filtered}
        pageSize={25}
        emptyTitle="No audit log entries"
        emptyDescription="System activities will appear here once logging is configured."
      />
    </div>
  );
}
