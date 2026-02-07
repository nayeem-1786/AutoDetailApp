'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Quote, QuoteStatus } from '@/lib/supabase/types';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils/format';
import { QUOTE_STATUS_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, Eye, Pencil, Send, ArrowRightCircle, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

type QuoteWithRelations = Quote & {
  customer?: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  vehicle?: { id: string; year: number | null; make: string | null; model: string | null } | null;
};

const STATUS_BADGE_VARIANT: Record<QuoteStatus, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'default',
  sent: 'info',
  viewed: 'warning',
  accepted: 'success',
  expired: 'destructive',
  converted: 'secondary',
};

export default function QuotesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [quotes, setQuotes] = useState<QuoteWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<QuoteWithRelations | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadQuotes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('quotes')
      .select(
        `
        *,
        customer:customers(id, first_name, last_name, phone),
        vehicle:vehicles(id, year, make, model),
        items:quote_items(*)
      `
      )
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading quotes:', error);
    }
    if (data) setQuotes(data as QuoteWithRelations[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadQuotes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      // Status filter
      if (statusFilter !== 'all' && q.status !== statusFilter) return false;

      // Search filter
      if (search) {
        const query = search.toLowerCase();
        const matchesNumber = q.quote_number?.toLowerCase().includes(query);
        const customerName = q.customer
          ? `${q.customer.first_name} ${q.customer.last_name}`.toLowerCase()
          : '';
        const matchesCustomer = customerName.includes(query);
        if (!matchesNumber && !matchesCustomer) return false;
      }

      return true;
    });
  }, [quotes, search, statusFilter]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const res = await fetch(`/api/quotes/${deleteTarget.id}`, { method: 'DELETE' });
    if (res.ok) {
      setQuotes((prev) => prev.filter((q) => q.id !== deleteTarget.id));
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to delete quote');
    }

    setDeleting(false);
    setDeleteTarget(null);
  }

  async function handleSend(quote: QuoteWithRelations) {
    const res = await fetch(`/api/quotes/${quote.id}/send`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      // Update local state
      setQuotes((prev) =>
        prev.map((q) =>
          q.id === quote.id ? { ...q, status: 'sent' as QuoteStatus, sent_at: new Date().toISOString() } : q
        )
      );
      // Copy link to clipboard
      if (data.link) {
        await navigator.clipboard.writeText(data.link).catch(() => {});
        alert(`Quote sent! Link copied to clipboard:\n${data.link}`);
      }
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to send quote');
    }
  }

  const columns: ColumnDef<QuoteWithRelations, unknown>[] = [
    {
      accessorKey: 'quote_number',
      header: 'Quote #',
      cell: ({ row }) => (
        <button
          className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
          onClick={() => router.push(`/admin/quotes/${row.original.id}`)}
        >
          {row.original.quote_number}
        </button>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      accessorFn: (row) =>
        row.customer ? `${row.customer.first_name} ${row.customer.last_name}` : 'Unknown',
      cell: ({ row }) => {
        const c = row.original.customer;
        if (!c) return <span className="text-sm text-gray-400">Unknown</span>;
        return (
          <div>
            <div className="text-sm font-medium text-gray-900">
              {c.first_name} {c.last_name}
            </div>
          </div>
        );
      },
    },
    {
      id: 'vehicle',
      header: 'Vehicle',
      cell: ({ row }) => {
        const v = row.original.vehicle;
        if (!v) return <span className="text-sm text-gray-400">--</span>;
        return (
          <span className="text-sm text-gray-600">
            {[v.year, v.make, v.model].filter(Boolean).join(' ')}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status as QuoteStatus;
        return (
          <Badge variant={STATUS_BADGE_VARIANT[status] ?? 'default'}>
            {QUOTE_STATUS_LABELS[status] ?? status}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'total_amount',
      header: 'Total',
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {formatCurrency(row.original.total_amount)}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'last_contacted',
      header: 'Last Contacted',
      cell: ({ row }) => {
        const sentAt = row.original.sent_at;
        if (!sentAt) return <span className="text-sm text-gray-400">--</span>;
        return (
          <span className="text-sm text-gray-500">{formatDateTime(sentAt)}</span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const q = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/admin/quotes/${q.id}`)}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </DropdownMenuItem>
              {q.status === 'draft' && (
                <DropdownMenuItem onClick={() => router.push(`/admin/quotes/${q.id}`)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {q.status === 'draft' && (
                <DropdownMenuItem onClick={() => handleSend(q)}>
                  <Send className="mr-2 h-4 w-4" />
                  Send
                </DropdownMenuItem>
              )}
              {q.status === 'accepted' && (
                <DropdownMenuItem onClick={() => router.push(`/admin/quotes/${q.id}`)}>
                  <ArrowRightCircle className="mr-2 h-4 w-4" />
                  Convert to Appointment
                </DropdownMenuItem>
              )}
              {q.status === 'draft' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onClick={() => setDeleteTarget(q)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
        title="Quotes"
        description={`${quotes.length} total quotes`}
        action={
          <Button onClick={() => router.push('/admin/quotes/new')}>
            <Plus className="h-4 w-4" />
            New Quote
          </Button>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by quote # or customer..."
          className="w-full sm:w-96"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="all">All Statuses</option>
          {Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No quotes found"
        emptyDescription="Create your first quote to get started."
        emptyAction={
          <Button onClick={() => router.push('/admin/quotes/new')}>
            <Plus className="h-4 w-4" />
            New Quote
          </Button>
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Quote"
        description={`Are you sure you want to delete ${deleteTarget?.quote_number}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
