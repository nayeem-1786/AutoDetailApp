'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ClipboardList, Download } from 'lucide-react';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_TYPE_LABELS,
  AUDIT_ACTION_BADGE_VARIANT,
} from '@/lib/utils/constants';
import type { AuditLogEntry } from '@/lib/supabase/types';

const PAGE_SIZE = 50;

const DATE_PRESETS = [
  { label: 'All Time', value: '' },
  { label: 'Today', value: 'today' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
];

function formatPstDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(iso));
}

function formatPstFullDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'short',
  }).format(new Date(iso));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatPstDateTime(iso);
}

function getDateRange(preset: string): { from: string; to: string } | null {
  if (!preset) return null;
  // Approximate PST by using America/Los_Angeles offset
  const now = new Date();
  const pstNow = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  );
  const year = pstNow.getFullYear();
  const month = String(pstNow.getMonth() + 1).padStart(2, '0');
  const day = String(pstNow.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  if (preset === 'today') {
    return { from: todayStr, to: todayStr };
  }
  const days = parseInt(preset);
  if (isNaN(days)) return null;
  const from = new Date(pstNow);
  from.setDate(from.getDate() - days + 1);
  const fromYear = from.getFullYear();
  const fromMonth = String(from.getMonth() + 1).padStart(2, '0');
  const fromDay = String(from.getDate()).padStart(2, '0');
  return { from: `${fromYear}-${fromMonth}-${fromDay}`, to: todayStr };
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [datePreset, setDatePreset] = useState('');

  // Detail dialog
  const [detailEntry, setDetailEntry] = useState<AuditLogEntry | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, entityType, action, datePreset]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (entityType) params.set('entity_type', entityType);
    if (action) params.set('action', action);

    const dateRange = getDateRange(datePreset);
    if (dateRange) {
      params.set('date_from', dateRange.from);
      params.set('date_to', dateRange.to);
    }

    try {
      const res = await adminFetch(`/api/admin/audit-log?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setEntries(json.entries || []);
        setTotal(json.total || 0);
        setTotalPages(json.totalPages || 1);
      }
    } catch {
      // adminFetch handles 401 redirect
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, entityType, action, datePreset]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (entityType) params.set('entity_type', entityType);
      if (action) params.set('action', action);

      const dateRange = getDateRange(datePreset);
      if (dateRange) {
        params.set('date_from', dateRange.from);
        params.set('date_to', dateRange.to);
      }

      const res = await adminFetch(`/api/admin/audit-log/export?${params.toString()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // adminFetch handles 401
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description={loading ? 'Loading...' : `${total} entries`}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || total === 0}
          >
            <Download className="mr-1 h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, email..."
          className="w-full sm:w-64"
        />
        <Select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="w-full sm:w-40"
        >
          <option value="">All Types</option>
          {Object.entries(AUDIT_ENTITY_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="w-full sm:w-40"
        >
          <option value="">All Actions</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value)}
          className="w-full sm:w-36"
        >
          {DATE_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ClipboardList}
              title="No audit entries yet"
              description="Actions will appear here as staff members use the system."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-ui-border bg-ui-bg shadow-ui">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ width: 130 }}>Time</TableHead>
                  <TableHead style={{ width: 120 }}>User</TableHead>
                  <TableHead style={{ width: 110 }}>Action</TableHead>
                  <TableHead style={{ width: 110 }}>Type</TableHead>
                  <TableHead style={{ width: 200 }}>Entity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, idx) => (
                  <TableRow
                    key={entry.id}
                    className={idx % 2 === 1 ? 'bg-gray-50 dark:bg-gray-800/50' : ''}
                  >
                    <TableCell className="py-1.5">
                      <span
                        className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
                        title={formatPstFullDateTime(entry.created_at)}
                      >
                        {timeAgo(entry.created_at)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="text-sm text-gray-700 dark:text-gray-300" title={entry.user_email || undefined}>
                        {entry.employee_name || entry.user_email || 'System'}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Badge variant={AUDIT_ACTION_BADGE_VARIANT[entry.action] || 'secondary'}>
                        {AUDIT_ACTION_LABELS[entry.action] || entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {AUDIT_ENTITY_TYPE_LABELS[entry.entity_type] || entry.entity_type}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {entry.entity_label || entry.entity_id || '--'}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      {entry.details ? (
                        <button
                          className="block max-w-[400px] truncate text-left text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                          title="Click to view details"
                          onClick={() => setDetailEntry(entry)}
                        >
                          {JSON.stringify(entry.details)}
                        </button>
                      ) : (
                        <span className="text-sm text-gray-400">--</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailEntry} onOpenChange={(open) => !open && setDetailEntry(null)}>
        <DialogHeader>
          <DialogTitle>Audit Entry Details</DialogTitle>
        </DialogHeader>
        <DialogContent>
          {detailEntry && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-medium text-gray-500 dark:text-gray-400">Time</span>
                <span>{formatPstFullDateTime(detailEntry.created_at)}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-medium text-gray-500 dark:text-gray-400">User</span>
                <span>{detailEntry.employee_name || detailEntry.user_email || 'System'}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-medium text-gray-500 dark:text-gray-400">Action</span>
                <Badge variant={AUDIT_ACTION_BADGE_VARIANT[detailEntry.action] || 'secondary'}>
                  {AUDIT_ACTION_LABELS[detailEntry.action] || detailEntry.action}
                </Badge>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-medium text-gray-500 dark:text-gray-400">Type</span>
                <span>{AUDIT_ENTITY_TYPE_LABELS[detailEntry.entity_type] || detailEntry.entity_type}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-medium text-gray-500 dark:text-gray-400">Entity</span>
                <span>{detailEntry.entity_label || detailEntry.entity_id || '--'}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-medium text-gray-500 dark:text-gray-400">Source</span>
                <span className="capitalize">{detailEntry.source}</span>
              </div>
              {detailEntry.ip_address && (
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="font-medium text-gray-500 dark:text-gray-400">IP Address</span>
                  <span className="font-mono text-xs">{detailEntry.ip_address}</span>
                </div>
              )}
              {detailEntry.details && (
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Details</span>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-gray-50 p-3 text-xs dark:bg-gray-800">
                    {JSON.stringify(detailEntry.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDetailEntry(null)}>
            Close
          </Button>
        </DialogFooter>
        <DialogClose onClose={() => setDetailEntry(null)} />
      </Dialog>
    </div>
  );
}
