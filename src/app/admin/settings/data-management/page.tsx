'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { toast } from 'sonner';
import { X, Trash2, AlertTriangle, UserX, MessageSquareWarning, RefreshCw } from 'lucide-react';
import { usePermission } from '@/lib/hooks/use-permission';
import { formatPhone } from '@/lib/utils/format';

interface CustomerResult {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
}

interface PurgeCounts {
  appointments: number;
  quotes: number;
  jobs: number;
  vehicles: number;
  transactions: number;
  orders: number;
  messages: number;
  calls: number;
}

interface PurgeQueueItem {
  customer: CustomerResult;
  counts: PurgeCounts | null;
  loadingCounts: boolean;
}

interface OrphanConversation {
  id: string;
  phone_number: string;
  last_message_at: string | null;
  created_at: string;
  status: string;
  message_count: number;
}

export default function DataManagementPage() {
  const { granted: canAccess, loading: permLoading } = usePermission('settings.backup_export');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [purgeQueue, setPurgeQueue] = useState<PurgeQueueItem[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Orphan conversations (Workstream J follow-up — conversations whose
  // customer record was never created because send_quote_sms /
  // create_appointment failed before the side-effect INSERT could run).
  const [orphans, setOrphans] = useState<OrphanConversation[]>([]);
  const [orphansLoading, setOrphansLoading] = useState(true);
  const [orphanSelected, setOrphanSelected] = useState<Set<string>>(new Set());
  const [orphanConfirmOpen, setOrphanConfirmOpen] = useState(false);
  const [orphanPurging, setOrphanPurging] = useState(false);

  const loadOrphans = useCallback(async () => {
    setOrphansLoading(true);
    try {
      const res = await adminFetch('/api/admin/orphan-conversations');
      if (res.ok) {
        const { conversations } = await res.json();
        setOrphans(conversations || []);
      } else {
        setOrphans([]);
      }
    } catch {
      setOrphans([]);
    } finally {
      setOrphansLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canAccess) loadOrphans();
  }, [canAccess, loadOrphans]);

  function toggleOrphan(id: string) {
    setOrphanSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllOrphans() {
    setOrphanSelected(new Set(orphans.map((o) => o.id)));
  }

  function clearOrphanSelection() {
    setOrphanSelected(new Set());
  }

  async function executeOrphanPurge() {
    setOrphanPurging(true);
    try {
      const ids = Array.from(orphanSelected);
      const res = await adminFetch('/api/admin/orphan-conversations/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationIds: ids }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`${data.purgedCount} orphan conversation(s) deleted.`);
        setOrphanSelected(new Set());
        await loadOrphans();
      } else if (res.ok && data.errors?.length > 0) {
        toast.warning(
          `Purge completed with ${data.errors.length} error(s).`,
          { description: data.errors.map((e: { table: string; error: string }) => `${e.table}: ${e.error}`).join(', ') }
        );
        setOrphanSelected(new Set());
        await loadOrphans();
      } else {
        toast.error(data.error || 'Orphan purge failed');
      }
    } catch (err) {
      toast.error('Orphan purge failed — check console for details');
      console.error('Orphan purge error:', err);
    } finally {
      setOrphanPurging(false);
      setOrphanConfirmOpen(false);
    }
  }

  const queuedIds = new Set(purgeQueue.map((item) => item.customer.id));

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await adminFetch(
          `/api/admin/customers/search?q=${encodeURIComponent(query.trim())}&include_deleted=true`
        );
        if (res.ok) {
          const { data } = await res.json();
          setSearchResults(data || []);
        }
      } catch {
        // Silently fail on search errors
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  async function addToPurgeQueue(customer: CustomerResult) {
    if (queuedIds.has(customer.id)) return;

    const item: PurgeQueueItem = { customer, counts: null, loadingCounts: true };
    setPurgeQueue((prev) => [...prev, item]);

    // Fetch counts
    try {
      const res = await adminFetch(`/api/admin/customers/${customer.id}/purge-preview`);
      if (res.ok) {
        const { counts } = await res.json();
        setPurgeQueue((prev) =>
          prev.map((p) =>
            p.customer.id === customer.id ? { ...p, counts, loadingCounts: false } : p
          )
        );
      } else {
        setPurgeQueue((prev) =>
          prev.map((p) =>
            p.customer.id === customer.id ? { ...p, loadingCounts: false } : p
          )
        );
      }
    } catch {
      setPurgeQueue((prev) =>
        prev.map((p) =>
          p.customer.id === customer.id ? { ...p, loadingCounts: false } : p
        )
      );
    }
  }

  function removeFromQueue(customerId: string) {
    setPurgeQueue((prev) => prev.filter((p) => p.customer.id !== customerId));
  }

  async function executePurge() {
    setPurging(true);
    try {
      const ids = purgeQueue.map((p) => p.customer.id);
      const res = await adminFetch('/api/admin/customers/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerIds: ids }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`${data.purgedCount} customer(s) and all associated data permanently deleted.`);
        setPurgeQueue([]);
        setSearchResults([]);
        setSearchQuery('');
      } else if (res.ok && data.errors?.length > 0) {
        toast.warning(
          `Purge completed with ${data.errors.length} error(s). Check details.`,
          { description: data.errors.map((e: { table: string; error: string }) => `${e.table}: ${e.error}`).join(', ') }
        );
        setPurgeQueue([]);
        setSearchResults([]);
        setSearchQuery('');
      } else {
        toast.error(data.error || 'Purge failed');
      }
    } catch (err) {
      toast.error('Purge failed — check console for details');
      console.error('Purge error:', err);
    } finally {
      setPurging(false);
      setConfirmOpen(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function renderCounts(item: PurgeQueueItem) {
    if (item.loadingCounts) return <Spinner className="h-4 w-4" />;
    if (!item.counts) return <span className="text-xs text-gray-400">Counts unavailable</span>;
    const c = item.counts;
    const parts: string[] = [];
    if (c.appointments) parts.push(`${c.appointments} appt${c.appointments !== 1 ? 's' : ''}`);
    if (c.quotes) parts.push(`${c.quotes} quote${c.quotes !== 1 ? 's' : ''}`);
    if (c.jobs) parts.push(`${c.jobs} job${c.jobs !== 1 ? 's' : ''}`);
    if (c.transactions) parts.push(`${c.transactions} txn${c.transactions !== 1 ? 's' : ''}`);
    if (c.messages) parts.push(`${c.messages} msg${c.messages !== 1 ? 's' : ''}`);
    if (c.vehicles) parts.push(`${c.vehicles} vehicle${c.vehicles !== 1 ? 's' : ''}`);
    if (c.orders) parts.push(`${c.orders} order${c.orders !== 1 ? 's' : ''}`);
    if (c.calls) parts.push(`${c.calls} call${c.calls !== 1 ? 's' : ''}`);
    if (parts.length === 0) return <span className="text-xs text-gray-400">No associated records</span>;
    return <span className="text-xs text-gray-500">{parts.join(' · ')}</span>;
  }

  const filteredResults = searchResults.filter((r) => !queuedIds.has(r.id));


  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-1 text-sm text-gray-500">You don&apos;t have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Management"
        description="Permanently delete customer records and all associated data."
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Destructive Operation</p>
            <p className="mt-1">
              This tool permanently deletes customer records and ALL associated data including
              appointments, quotes, jobs, messages, vehicles, transactions, call logs, and delivery logs.
              Deleted data cannot be recovered.
            </p>
          </div>
        </div>
      </div>

      {/* Section 1 — Customer Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Customers</CardTitle>
        </CardHeader>
        <CardContent>
          <SearchInput
            placeholder="Search by name, phone, or email..."
            value={searchQuery}
            onChange={handleSearch}
          />

          {searching && (
            <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
              <Spinner className="h-4 w-4" /> Searching...
            </div>
          )}

          {!searching && filteredResults.length > 0 && (
            <div className="mt-3 divide-y rounded-lg border">
              {filteredResults.map((customer) => (
                <div key={customer.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {customer.first_name} {customer.last_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatPhone(customer.phone) || '—'}
                      {customer.email ? ` · ${customer.email}` : ''}
                      {customer.created_at ? ` · Created ${formatDate(customer.created_at)}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addToPurgeQueue(customer)}
                    className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    Add to Purge List
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!searching && searchQuery.length >= 2 && filteredResults.length === 0 && searchResults.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-500">No customers found</p>
          )}
        </CardContent>
      </Card>

      {/* Section 2 — Purge Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserX className="h-4 w-4" />
            Records to Purge
            {purgeQueue.length > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                {purgeQueue.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {purgeQueue.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              No customers selected for purge. Search above to add customers.
            </p>
          ) : (
            <>
              <div className="divide-y rounded-lg border">
                {purgeQueue.map((item) => (
                  <div key={item.customer.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {item.customer.first_name} {item.customer.last_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatPhone(item.customer.phone) || '—'}
                        {item.customer.email ? ` · ${item.customer.email}` : ''}
                      </p>
                      <div className="mt-1">{renderCounts(item)}</div>
                    </div>
                    <button
                      onClick={() => removeFromQueue(item.customer.id)}
                      className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="Remove from purge list"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {purgeQueue.length} customer{purgeQueue.length !== 1 ? 's' : ''} selected
                </p>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmOpen(true)}
                  disabled={purging}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Purge All Records
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 3 — Orphan Conversations */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareWarning className="h-4 w-4" />
              Orphan Conversations
              {orphans.length > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {orphans.length}
                </span>
              )}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={loadOrphans}
              disabled={orphansLoading}
              className="gap-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${orphansLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Conversations whose customer record was never created (typically because a tool failed
            before the side-effect customer INSERT could run). The main Purge tool above cannot
            reach these — there is no customer to select.
          </p>
        </CardHeader>
        <CardContent>
          {orphansLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
              <Spinner className="h-4 w-4" /> Loading orphan conversations...
            </div>
          ) : orphans.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              No orphan conversations. All conversations are linked to customer records.
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
                <button
                  type="button"
                  onClick={selectAllOrphans}
                  className="text-blue-600 hover:underline"
                  disabled={orphanSelected.size === orphans.length}
                >
                  Select all ({orphans.length})
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={clearOrphanSelection}
                  className="text-blue-600 hover:underline"
                  disabled={orphanSelected.size === 0}
                >
                  Clear selection
                </button>
                {orphanSelected.size > 0 && (
                  <span className="ml-auto font-medium text-gray-700">
                    {orphanSelected.size} selected
                  </span>
                )}
              </div>

              <div className="divide-y rounded-lg border">
                {orphans.map((o) => {
                  const checked = orphanSelected.has(o.id);
                  return (
                    <label
                      key={o.id}
                      className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOrphan(o.id)}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {formatPhone(o.phone_number) || o.phone_number}
                        </p>
                        <p className="text-xs text-gray-500">
                          {o.message_count} message{o.message_count !== 1 ? 's' : ''}
                          {' · '}
                          last activity{' '}
                          {o.last_message_at
                            ? new Date(o.last_message_at).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })
                            : 'never'}
                          {' · '}
                          status {o.status}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-end">
                <Button
                  variant="destructive"
                  onClick={() => setOrphanConfirmOpen(true)}
                  disabled={orphanPurging || orphanSelected.size === 0}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Selected ({orphanSelected.size})
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Permanently Delete Customer Data"
        description={`You are about to permanently delete ${purgeQueue.length} customer(s) and ALL associated data including appointments, quotes, jobs, messages, vehicles, call logs, transactions, and delivery logs. This action CANNOT be undone.`}
        confirmLabel="Delete Everything"
        variant="destructive"
        loading={purging}
        onConfirm={executePurge}
        requireConfirmText="PURGE"
      />

      <ConfirmDialog
        open={orphanConfirmOpen}
        onOpenChange={setOrphanConfirmOpen}
        title="Permanently Delete Orphan Conversations"
        description={`You are about to permanently delete ${orphanSelected.size} orphan conversation(s) and all associated messages. This action CANNOT be undone.`}
        confirmLabel="Delete Orphans"
        variant="destructive"
        loading={orphanPurging}
        onConfirm={executeOrphanPurge}
        requireConfirmText="PURGE"
      />
    </div>
  );
}
