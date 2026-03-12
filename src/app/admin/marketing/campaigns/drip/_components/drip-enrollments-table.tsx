'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Pause, Play, X, SkipForward, Plus, Search } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatDate, formatDateTime } from '@/lib/utils/format';

// ─── Types ────────────────────────────────────────────────────────

interface EnrollmentRow {
  id: string;
  sequence_id: string;
  customer_id: string;
  current_step: number;
  enrolled_at: string;
  next_send_at: string | null;
  status: 'active' | 'completed' | 'stopped' | 'paused';
  stopped_reason: string | null;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

interface DripEnrollmentsTableProps {
  sequenceId: string;
}

// ─── Status badge mapping ─────────────────────────────────────────

const STATUS_VARIANT: Record<
  string,
  'success' | 'info' | 'destructive' | 'warning' | 'default'
> = {
  active: 'success',
  completed: 'info',
  stopped: 'destructive',
  paused: 'warning',
};

// ─── Component ────────────────────────────────────────────────────

export function DripEnrollmentsTable({
  sequenceId,
}: DripEnrollmentsTableProps) {
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Manual enroll state
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [enrollCustomerId, setEnrollCustomerId] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>
  >([]);
  const [searching, setSearching] = useState(false);

  // Cancel confirm
  const [cancelTarget, setCancelTarget] = useState<EnrollmentRow | null>(null);

  // ── Load enrollments ────────────────────────────────────────────
  const loadEnrollments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) params.set('status', statusFilter);

      const res = await adminFetch(
        `/api/admin/drip-sequences/${sequenceId}/enrollments?${params.toString()}`,
        { cache: 'no-store' }
      );

      if (res.ok) {
        const json = await res.json();
        setEnrollments(json.data || []);
        setTotal(json.total || 0);
      } else {
        toast.error('Failed to load enrollments');
      }
    } catch {
      toast.error('Failed to load enrollments');
    } finally {
      setLoading(false);
    }
  }, [sequenceId, statusFilter]);

  useEffect(() => {
    loadEnrollments();
  }, [loadEnrollments]);

  // ── Action handler ──────────────────────────────────────────────
  async function handleAction(
    enrollId: string,
    action: 'pause' | 'resume' | 'cancel' | 'skip'
  ) {
    setActionLoading(enrollId);
    try {
      const res = await adminFetch(
        `/api/admin/drip-sequences/${sequenceId}/enrollments/${enrollId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );

      if (res.ok) {
        const json = await res.json();
        // Update the enrollment in the local state
        setEnrollments((prev) =>
          prev.map((e) => (e.id === enrollId ? { ...e, ...json.data } : e))
        );
        toast.success(
          action === 'pause'
            ? 'Enrollment paused'
            : action === 'resume'
              ? 'Enrollment resumed'
              : action === 'cancel'
                ? 'Enrollment cancelled'
                : 'Step skipped'
        );
      } else {
        const json = await res.json();
        toast.error(json.error || `Failed to ${action} enrollment`);
      }
    } catch {
      toast.error(`Failed to ${action} enrollment`);
    } finally {
      setActionLoading(null);
      setCancelTarget(null);
    }
  }

  // ── Customer search ─────────────────────────────────────────────
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await adminFetch(
        `/api/admin/customers/search?q=${encodeURIComponent(searchQuery.trim())}&limit=10`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.data || []);
      }
    } catch {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  }

  // ── Manual enroll ───────────────────────────────────────────────
  async function handleManualEnroll(customerId: string) {
    setEnrolling(true);
    try {
      const res = await adminFetch(
        `/api/admin/drip-sequences/${sequenceId}/enrollments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: customerId }),
        }
      );

      if (res.ok) {
        toast.success('Customer enrolled');
        setShowEnrollForm(false);
        setSearchQuery('');
        setSearchResults([]);
        setEnrollCustomerId('');
        loadEnrollments();
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to enroll customer');
      }
    } catch {
      toast.error('Failed to enroll customer');
    } finally {
      setEnrolling(false);
    }
  }

  // ── Columns ─────────────────────────────────────────────────────
  const columns: ColumnDef<EnrollmentRow, unknown>[] = useMemo(
    () => [
      {
        id: 'customer',
        header: 'Customer',
        size: 220,
        cell: ({ row }) => {
          const c = row.original.customer;
          if (!c) {
            return (
              <span className="text-sm text-ui-text-muted">
                Unknown customer
              </span>
            );
          }
          const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unnamed';
          return (
            <Link
              href={`/admin/customers/${c.id}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              {name}
            </Link>
          );
        },
      },
      {
        id: 'enrolled',
        header: 'Enrolled',
        size: 140,
        cell: ({ row }) => (
          <span className="text-sm text-ui-text-muted">
            {formatDate(row.original.enrolled_at)}
          </span>
        ),
      },
      {
        id: 'step',
        header: 'Step',
        size: 80,
        cell: ({ row }) => (
          <Badge variant="info">Step {row.original.current_step + 1}</Badge>
        ),
      },
      {
        id: 'next_send',
        header: 'Next Send',
        size: 160,
        cell: ({ row }) => (
          <span className="text-sm text-ui-text-muted">
            {row.original.next_send_at
              ? formatDateTime(row.original.next_send_at)
              : '--'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        size: 100,
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status] || 'default'}>
            {row.original.status}
          </Badge>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: '',
        size: 180,
        cell: ({ row }) => {
          const e = row.original;
          const isLoading = actionLoading === e.id;

          return (
            <div className="flex items-center justify-end gap-1">
              {e.status === 'active' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAction(e.id, 'pause')}
                    disabled={isLoading}
                    title="Pause"
                  >
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAction(e.id, 'skip')}
                    disabled={isLoading}
                    title="Skip step"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCancelTarget(e)}
                    disabled={isLoading}
                    className="text-gray-400 hover:text-red-600"
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              {e.status === 'paused' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAction(e.id, 'resume')}
                    disabled={isLoading}
                    title="Resume"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCancelTarget(e)}
                    disabled={isLoading}
                    className="text-gray-400 hover:text-red-600"
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actionLoading, sequenceId]
  );

  return (
    <div className="space-y-4">
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-36"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="stopped">Stopped</option>
          </Select>
          <span className="text-sm text-ui-text-muted">
            {total} enrollment{total !== 1 ? 's' : ''}
          </span>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowEnrollForm(!showEnrollForm)}
        >
          <Plus className="h-4 w-4" />
          Manual Enroll
        </Button>
      </div>

      {/* ── Manual enroll form ─────────────────────────────────── */}
      {showEnrollForm && (
        <div className="rounded-lg border border-ui-border bg-ui-bg p-4">
          <p className="mb-3 text-sm font-medium text-ui-text">
            Search for a customer to enroll
          </p>
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or phone..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
            >
              {searching ? (
                <Spinner size="sm" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-3 space-y-1">
              {searchResults.map((customer) => {
                const customerName =
                  [customer.first_name, customer.last_name]
                    .filter(Boolean)
                    .join(' ') || 'Unnamed';
                return (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-ui-bg-hover"
                  >
                    <div>
                      <p className="text-sm font-medium text-ui-text">
                        {customerName}
                      </p>
                      {customer.email && (
                        <p className="text-xs text-ui-text-muted">
                          {customer.email}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleManualEnroll(customer.id)}
                      disabled={enrolling}
                    >
                      {enrolling ? 'Enrolling...' : 'Enroll'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !searching && (
            <div className="mt-3">
              <p className="text-sm text-ui-text-muted">
                No customers found. You can also enroll by customer ID:
              </p>
              <div className="mt-2 flex gap-2">
                <Input
                  value={enrollCustomerId}
                  onChange={(e) => setEnrollCustomerId(e.target.value)}
                  placeholder="Paste customer UUID..."
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => handleManualEnroll(enrollCustomerId)}
                  disabled={enrolling || !enrollCustomerId.trim()}
                >
                  {enrolling ? 'Enrolling...' : 'Enroll'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={enrollments}
          emptyTitle="No enrollments"
          emptyDescription="No customers are enrolled in this sequence yet."
        />
      )}

      {/* ── Cancel confirm dialog ──────────────────────────────── */}
      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title="Cancel Enrollment"
        description={`Are you sure you want to cancel this enrollment? The customer will stop receiving messages from this sequence.`}
        confirmLabel="Cancel Enrollment"
        variant="destructive"
        loading={actionLoading === cancelTarget?.id}
        onConfirm={() => {
          if (cancelTarget) handleAction(cancelTarget.id, 'cancel');
        }}
      />
    </div>
  );
}
