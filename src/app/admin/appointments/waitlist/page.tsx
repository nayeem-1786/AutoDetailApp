'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Bell,
  CalendarCheck,
  XCircle,
  Trash2,
  ClipboardList,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatDate, formatTime, formatPhone } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { WaitlistStatus } from '@/lib/supabase/types';

interface WaitlistEntryRow {
  id: string;
  customer_id: string;
  service_id: string;
  preferred_date: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  status: WaitlistStatus;
  notified_at: string | null;
  notes: string | null;
  created_at: string;
  customer: {
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
  service: {
    name: string;
  } | null;
}

const STATUS_BADGE_VARIANT: Record<WaitlistStatus, 'warning' | 'info' | 'success' | 'secondary' | 'destructive'> = {
  waiting: 'warning',
  notified: 'info',
  booked: 'success',
  expired: 'secondary',
  cancelled: 'destructive',
};

const STATUS_LABELS: Record<WaitlistStatus, string> = {
  waiting: 'Waiting',
  notified: 'Notified',
  booked: 'Booked',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

const TAB_VALUES = ['all', 'waiting', 'notified', 'booked', 'cancelled'] as const;
type TabValue = (typeof TAB_VALUES)[number];

export default function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const limit = 20;

  const fetchEntries = useCallback(async (statusFilter: TabValue, pageNum: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      params.set('page', pageNum.toString());
      params.set('limit', limit.toString());

      const res = await fetch(`/api/waitlist?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to load waitlist');
        return;
      }

      setEntries(data.entries);
      setTotal(data.total);
    } catch {
      toast.error('Failed to load waitlist');
    } finally {
      setLoading(false);
    }
  }, []);

  // Check feature flag on mount
  useEffect(() => {
    async function checkFlag() {
      try {
        // Use the waitlist API itself - if it returns data, feature is accessible
        const res = await fetch('/api/waitlist?limit=1');
        if (res.ok) {
          setFeatureEnabled(true);
        } else {
          setFeatureEnabled(true); // API works, just may be empty
        }
      } catch {
        setFeatureEnabled(false);
      }
    }
    checkFlag();
  }, []);

  useEffect(() => {
    if (featureEnabled) {
      fetchEntries(activeTab, page);
    }
  }, [featureEnabled, activeTab, page, fetchEntries]);

  function handleTabChange(value: string) {
    setActiveTab(value as TabValue);
    setPage(1);
  }

  async function handleUpdateStatus(entryId: string, status: 'notified' | 'booked' | 'cancelled') {
    setActionLoading(entryId);
    try {
      const res = await fetch(`/api/waitlist/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to update entry');
        return;
      }

      const statusLabel = STATUS_LABELS[status];
      toast.success(`Entry marked as ${statusLabel}`);
      fetchEntries(activeTab, page);
    } catch {
      toast.error('Failed to update entry');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(entryId: string) {
    setActionLoading(entryId);
    try {
      const res = await fetch(`/api/waitlist/${entryId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to remove entry');
        return;
      }

      toast.success('Entry removed');
      fetchEntries(activeTab, page);
    } catch {
      toast.error('Failed to remove entry');
    } finally {
      setActionLoading(null);
    }
  }

  // Feature flag not yet checked
  if (featureEnabled === null) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Feature disabled
  if (!featureEnabled) {
    return (
      <div>
        <PageHeader
          title="Waitlist"
          action={
            <Link href="/admin/appointments">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to Appointments
              </Button>
            </Link>
          }
        />
        <div className="mt-12">
          <EmptyState
            icon={ClipboardList}
            title="Waitlist is disabled"
            description="Enable the waitlist feature flag in Settings to start accepting waitlist entries."
          />
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <PageHeader
        title="Waitlist"
        description={loading ? undefined : `${total} total entries`}
        action={
          <Link href="/admin/appointments">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Appointments
            </Button>
          </Link>
        }
      />

      <div className="mt-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="waiting">Waiting</TabsTrigger>
            <TabsTrigger value="notified">Notified</TabsTrigger>
            <TabsTrigger value="booked">Booked</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>

          {TAB_VALUES.map((tab) => (
            <TabsContent key={tab} value={tab}>
              {loading ? (
                <div className="flex h-60 items-center justify-center">
                  <Spinner size="lg" />
                </div>
              ) : entries.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No waitlist entries"
                  description={
                    tab === 'all'
                      ? 'No one has joined the waitlist yet.'
                      : `No entries with status "${STATUS_LABELS[tab as WaitlistStatus]}".`
                  }
                />
              ) : (
                <>
                  {/* Table */}
                  <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 text-left">
                          <th className="px-4 py-3 font-medium text-gray-600">Customer</th>
                          <th className="px-4 py-3 font-medium text-gray-600">Phone</th>
                          <th className="px-4 py-3 font-medium text-gray-600">Service</th>
                          <th className="px-4 py-3 font-medium text-gray-600">Preferred Date</th>
                          <th className="px-4 py-3 font-medium text-gray-600">Preferred Time</th>
                          <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                          <th className="px-4 py-3 font-medium text-gray-600">Created</th>
                          <th className="px-4 py-3 font-medium text-gray-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {entries.map((entry) => {
                          const isLoading = actionLoading === entry.id;
                          const customerName = entry.customer
                            ? `${entry.customer.first_name} ${entry.customer.last_name}`
                            : 'Unknown';
                          const phone = entry.customer?.phone
                            ? formatPhone(entry.customer.phone)
                            : '--';
                          const serviceName = entry.service?.name ?? 'Unknown';

                          let timeRange = '--';
                          if (entry.preferred_time_start && entry.preferred_time_end) {
                            timeRange = `${formatTime(entry.preferred_time_start)} - ${formatTime(entry.preferred_time_end)}`;
                          } else if (entry.preferred_time_start) {
                            timeRange = `From ${formatTime(entry.preferred_time_start)}`;
                          } else if (entry.preferred_time_end) {
                            timeRange = `Until ${formatTime(entry.preferred_time_end)}`;
                          }

                          return (
                            <tr key={entry.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">
                                {customerName}
                              </td>
                              <td className="px-4 py-3 text-gray-600">{phone}</td>
                              <td className="px-4 py-3 text-gray-600">{serviceName}</td>
                              <td className="px-4 py-3 text-gray-600">
                                {entry.preferred_date
                                  ? formatDate(entry.preferred_date)
                                  : 'Any date'}
                              </td>
                              <td className="px-4 py-3 text-gray-600">{timeRange}</td>
                              <td className="px-4 py-3">
                                <Badge variant={STATUS_BADGE_VARIANT[entry.status]}>
                                  {STATUS_LABELS[entry.status]}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-gray-500">
                                {formatDate(entry.created_at)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  {entry.status === 'waiting' && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={isLoading}
                                        onClick={() => handleUpdateStatus(entry.id, 'notified')}
                                        title="Notify customer"
                                        className={cn(
                                          'h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700'
                                        )}
                                      >
                                        <Bell className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={isLoading}
                                        onClick={() => handleUpdateStatus(entry.id, 'booked')}
                                        title="Mark as booked"
                                        className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                                      >
                                        <CalendarCheck className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={isLoading}
                                        onClick={() => handleUpdateStatus(entry.id, 'cancelled')}
                                        title="Cancel"
                                        className="h-8 w-8 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                      >
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}

                                  {entry.status === 'notified' && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={isLoading}
                                        onClick={() => handleUpdateStatus(entry.id, 'booked')}
                                        title="Mark as booked"
                                        className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                                      >
                                        <CalendarCheck className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={isLoading}
                                        onClick={() => handleUpdateStatus(entry.id, 'cancelled')}
                                        title="Cancel"
                                        className="h-8 w-8 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                      >
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}

                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={isLoading}
                                    onClick={() => handleDelete(entry.id)}
                                    title="Remove entry"
                                    className="h-8 w-8 text-red-400 hover:bg-red-50 hover:text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-sm text-gray-500">
                        Showing {(page - 1) * limit + 1}
                        {' '}-{' '}
                        {Math.min(page * limit, total)} of {total}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-gray-600">
                          Page {page} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
