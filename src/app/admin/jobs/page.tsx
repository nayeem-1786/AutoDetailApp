'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatCurrency } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Pagination } from '@/components/ui/pagination';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Camera,
  Puzzle,
  Clock,
  Calendar,
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

  // Data
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffOption[]>([]);

  // Filters
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [staffFilter, setStaffFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const limit = 20;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

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

  // Load jobs
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (statusFilter) params.set('status', statusFilter);
    if (staffFilter) params.set('staff_id', staffFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (debouncedSearch && debouncedSearch.length >= 2) params.set('search', debouncedSearch);
    params.set('sort_by', sortBy);
    params.set('sort_dir', sortDir);

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
  }, [page, statusFilter, staffFilter, dateFrom, dateTo, debouncedSearch, sortBy, sortDir]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Sort handler
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir('desc');
    }
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 text-gray-400" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="ml-1 inline h-3.5 w-3.5 text-gray-700" />
    ) : (
      <ArrowDown className="ml-1 inline h-3.5 w-3.5 text-gray-700" />
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Records"
        description="All jobs and service visits"
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search customer..."
          className="w-64"
        />

        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="w-40"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>

        <Select
          value={staffFilter}
          onChange={(e) => {
            setStaffFilter(e.target.value);
            setPage(1);
          }}
          className="w-40"
        >
          <option value="">All Staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.first_name} {s.last_name}
            </option>
          ))}
        </Select>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
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
            Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total} jobs
          </>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
              <th
                className="cursor-pointer px-4 py-3 hover:text-gray-700"
                onClick={() => handleSort('created_at')}
              >
                Date <SortIcon column="created_at" />
              </th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Services</th>
              <th className="px-4 py-3 text-center">Add-ons</th>
              <th className="px-4 py-3 text-center">Photos</th>
              <th
                className="cursor-pointer px-4 py-3 hover:text-gray-700"
                onClick={() => handleSort('timer_seconds')}
              >
                Duration <SortIcon column="timer_seconds" />
              </th>
              <th className="px-4 py-3">Staff</th>
              <th
                className="cursor-pointer px-4 py-3 hover:text-gray-700"
                onClick={() => handleSort('status')}
              >
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
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
