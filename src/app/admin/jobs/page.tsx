'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { Pagination } from '@/components/ui/pagination';
import { TableToolbar, type FilterConfig } from '@/components/admin/table-toolbar';
import { useTableState } from '@/lib/hooks/useTableState';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Camera,
  Puzzle,
  Clock,
  Briefcase,
} from 'lucide-react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JobListItem {
  id: string;
  status: string;
  services: { id: string; name: string; price: number }[];
  timer_seconds: number;
  work_started_at: string | null;
  work_completed_at: string | null;
  appointment_id: string | null;
  transaction_id: string | null;
  created_at: string;
  customer: { id: string; first_name: string; last_name: string; phone: string } | null;
  vehicle: { id: string; year: number | null; make: string | null; model: string | null; color: string | null } | null;
  assigned_staff: { id: string; first_name: string; last_name: string } | null;
  photo_count: number;
  addon_count: number;
}

interface StaffOption {
  id: string;
  first_name: string;
  last_name: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'intake', label: 'Intake' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_CLASSES: Record<string, string> = {
  scheduled: 'bg-gray-100 text-gray-700',
  intake: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-yellow-50 text-yellow-700',
  pending_approval: 'bg-orange-50 text-orange-700',
  completed: 'bg-green-50 text-green-700',
  closed: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-red-50 text-red-600',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  intake: 'Intake',
  in_progress: 'In Progress',
  pending_approval: 'Pending',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const DEFAULT_FILTERS = {
  status: '' as string,
  staff: '' as string,
  dateFrom: '' as string,
  dateTo: '' as string,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatJobDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
}

function formatServiceNames(services: { name: string }[]): string {
  if (!services || services.length === 0) return '-';
  if (services.length <= 2) return services.map((s) => s.name).join(', ');
  return `${services[0].name}, ${services[1].name} +${services.length - 2}`;
}

function formatVehicle(
  v: { year: number | null; make: string | null; model: string | null; color: string | null } | null
): string {
  if (!v) return '-';
  const parts = [v.year, v.make, v.model].filter(Boolean);
  return parts.join(' ') || '-';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminJobsPage() {
  const router = useRouter();

  const table = useTableState({
    defaultFilters: DEFAULT_FILTERS,
    defaultPageSize: 20,
  });

  // Data
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffOption[]>([]);

  // Convenience accessors
  const statusFilter = (table.filters.status as string) || '';
  const staffFilter = (table.filters.staff as string) || '';
  const dateFrom = (table.filters.dateFrom as string) || '';
  const dateTo = (table.filters.dateTo as string) || '';

  // Load staff for dropdown
  useEffect(() => {
    async function loadStaff() {
      const supabase = createClient();
      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .eq('status', 'active')
        .order('first_name');
      if (data) setStaff(data);
    }
    loadStaff();
  }, []);

  // Load jobs — server-side query driven by useTableState
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(table.page));
    params.set('limit', String(table.pageSize));
    if (statusFilter) params.set('status', statusFilter);
    if (staffFilter) params.set('staff_id', staffFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (table.debouncedSearch && table.debouncedSearch.length >= 2) params.set('search', table.debouncedSearch);
    params.set('sort_by', table.sort?.column || 'created_at');
    params.set('sort_dir', table.sort?.direction || 'desc');

    try {
      const res = await adminFetch(`/api/admin/jobs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [table.page, table.pageSize, statusFilter, staffFilter, dateFrom, dateTo, table.debouncedSearch, table.sort]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Sort handler — updates useTableState
  const handleSort = (column: string) => {
    if (table.sort?.column === column) {
      table.setSort({ column, direction: table.sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      table.setSort({ column, direction: 'desc' });
    }
  };

  const totalPages = Math.ceil(total / table.pageSize);

  const SortIcon = ({ column }: { column: string }) => {
    if (table.sort?.column !== column) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 text-gray-400" />;
    return table.sort.direction === 'asc' ? (
      <ArrowUp className="ml-1 inline h-3.5 w-3.5 text-gray-700" />
    ) : (
      <ArrowDown className="ml-1 inline h-3.5 w-3.5 text-gray-700" />
    );
  };

  // Toolbar config
  const toolbarFilters: FilterConfig[] = useMemo(() => [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: STATUS_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
    },
    {
      key: 'staff',
      label: 'Staff',
      type: 'select',
      options: [
        { label: 'All Staff', value: '' },
        ...staff.map((s) => ({ label: `${s.first_name} ${s.last_name}`, value: s.id })),
      ],
    },
  ], [staff]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Records"
        description="All jobs and service visits"
      />

      <TableToolbar
        state={table}
        defaultFilters={DEFAULT_FILTERS}
        config={{
          searchPlaceholder: 'Search customer...',
          filters: toolbarFilters,
        }}
      />

      {/* Date range filters — kept inline (toolbar doesn't support date inputs) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => table.setFilter('dateFrom', e.target.value)}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => table.setFilter('dateTo', e.target.value)}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
          />
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500">
        {loading ? (
          'Loading...'
        ) : (
          <>
            Showing {(table.page - 1) * table.pageSize + 1}-{Math.min(table.page * table.pageSize, total)} of {total} jobs
          </>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="cursor-pointer px-4 py-3 hover:text-gray-700" onClick={() => handleSort('created_at')}>
                Date <SortIcon column="created_at" />
              </th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Services</th>
              <th className="px-4 py-3 text-center">Add-ons</th>
              <th className="px-4 py-3 text-center">Photos</th>
              <th className="cursor-pointer px-4 py-3 hover:text-gray-700" onClick={() => handleSort('timer_seconds')}>
                Duration <SortIcon column="timer_seconds" />
              </th>
              <th className="px-4 py-3">Staff</th>
              <th className="cursor-pointer px-4 py-3 hover:text-gray-700" onClick={() => handleSort('status')}>
                Status <SortIcon column="status" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <Spinner className="mx-auto" />
                </td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  <Briefcase className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  No jobs found
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr
                  key={job.id}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                  onClick={() => router.push(`/admin/jobs/${job.id}`)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                    {formatJobDate(job.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {job.customer ? (
                      <Link
                        href={`/admin/customers/${job.customer.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {job.customer.first_name} {job.customer.last_name}
                      </Link>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatVehicle(job.vehicle)}
                    {job.vehicle?.color && (
                      <span className="ml-1 text-xs text-gray-400">({job.vehicle.color})</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-gray-600">
                    {formatServiceNames(job.services)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {job.addon_count > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                        <Puzzle className="h-3 w-3" />+{job.addon_count}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {job.photo_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <Camera className="h-3.5 w-3.5" />{job.photo_count}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {job.timer_seconds > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        {formatDuration(job.timer_seconds)}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {job.assigned_staff
                      ? `${job.assigned_staff.first_name} ${job.assigned_staff.last_name || ''}`.trim()
                      : <span className="text-gray-300">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[job.status] || 'bg-gray-100 text-gray-700'}`}
                    >
                      {STATUS_LABELS[job.status] || job.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {total > 0 && `${total} total job${total !== 1 ? 's' : ''}`}
        </p>
        <Pagination currentPage={table.page} totalPages={totalPages} onPageChange={table.setPage} />
      </div>
    </div>
  );
}
