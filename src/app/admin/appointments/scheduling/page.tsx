'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, Trash2, Plus, CalendarOff, ExternalLink, User } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { EmployeeSchedule } from '@/lib/supabase/types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface EmployeeBasic {
  id: string;
  first_name: string;
  last_name: string;
}

interface EmployeeScheduleData {
  employee: EmployeeBasic;
  schedule: EmployeeSchedule[];
}

interface BlockedDateRow {
  id: string;
  employee_id: string | null;
  date: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  employee?: { id: string; first_name: string; last_name: string } | null;
}

function summarizeSchedule(schedule: EmployeeSchedule[]): string {
  if (schedule.length === 0) return 'No schedule set';

  const availableDays = schedule
    .filter((s) => s.is_available)
    .map((s) => DAY_NAMES[s.day_of_week])
    .join(', ');

  return availableDays || 'No available days';
}

// ---------------------------------------------------------------------------
// Weekly Schedules Tab - Now shows links to individual staff profiles
// ---------------------------------------------------------------------------

function WeeklySchedulesTab() {
  const [data, setData] = useState<EmployeeScheduleData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/staff/schedules');
      const json = await res.json();
      if (res.ok) {
        setData(json.schedules);
      }
    } catch (err) {
      console.error('Failed to fetch schedules:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No bookable employees"
        description="Add employees and mark them as bookable to set up schedules."
        action={
          <Link href="/admin/staff">
            <Button>
              <User className="h-4 w-4" />
              Manage Staff
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bookable Staff</CardTitle>
          <p className="text-sm text-gray-500">
            Click on a staff member to view and edit their weekly schedule.
          </p>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-gray-100">
            {data.map((item) => {
              const scheduleSummary = summarizeSchedule(item.schedule);
              const hasSchedule = item.schedule.length > 0;

              return (
                <Link
                  key={item.employee.id}
                  href={`/admin/staff/${item.employee.id}?tab=schedule`}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:bg-gray-50 -mx-4 px-4 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                      <User className="h-5 w-5 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {item.employee.first_name} {item.employee.last_name}
                      </p>
                      <p className="text-xs text-gray-500">{scheduleSummary}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!hasSchedule && (
                      <Badge variant="warning">No schedule</Badge>
                    )}
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocked Dates Tab
// ---------------------------------------------------------------------------

function BlockedDatesTab() {
  const [blockedDates, setBlockedDates] = useState<BlockedDateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form state
  const [formDate, setFormDate] = useState('');
  const [formReason, setFormReason] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const blockedRes = await fetch('/api/staff/blocked-dates');
      const blockedJson = await blockedRes.json();

      if (blockedRes.ok) {
        // Only show shop-wide blocked dates (employee_id is null)
        const shopWide = (blockedJson.blocked_dates || []).filter(
          (bd: BlockedDateRow) => bd.employee_id === null
        );
        setBlockedDates(shopWide);
      }
    } catch (err) {
      console.error('Failed to fetch blocked dates:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleAdd() {
    if (!formDate) return;
    setAdding(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/staff/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: null, // Shop-wide closure
          date: formDate,
          reason: formReason || null,
        }),
      });

      if (res.ok) {
        setFeedback({ type: 'success', message: 'Shop holiday added' });
        setFormDate('');
        setFormReason('');
        fetchData();
      } else {
        const json = await res.json();
        setFeedback({ type: 'error', message: json.error || 'Failed to add holiday' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network error' });
    }

    setAdding(false);
    setTimeout(() => setFeedback(null), 3000);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/staff/blocked-dates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setBlockedDates((prev) => prev.filter((bd) => bd.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete blocked date:', err);
    }
    setDeleting(null);
  }

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Blocked Date Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Shop Holiday / Closure
          </CardTitle>
          <p className="text-sm text-gray-500">
            Block dates when the entire shop is closed (holidays, special events).
            For individual employee time off, use their Staff Profile → Schedule tab.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="blocked-date">Date</Label>
              <Input
                id="blocked-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="blocked-reason">Reason (optional)</Label>
              <Input
                id="blocked-reason"
                type="text"
                placeholder="e.g. Christmas, New Year's Day"
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleAdd}
                disabled={!formDate || adding}
                className="w-full sm:w-auto"
              >
                {adding ? (
                  <>
                    <Spinner size="sm" className="text-white" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add Holiday
                  </>
                )}
              </Button>
            </div>
          </div>

          {feedback && (
            <p
              className={`mt-3 text-sm ${
                feedback.type === 'success' ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {feedback.message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Existing Blocked Dates List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarOff className="h-4 w-4" />
            Shop Holidays & Closures
          </CardTitle>
        </CardHeader>
        <CardContent>
          {blockedDates.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No shop holidays"
              description="Add holidays when the entire shop is closed (e.g., Christmas, New Year's)."
              className="py-8"
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {blockedDates.map((bd) => {
                const isDeleting = deleting === bd.id;
                const displayDate = new Date(bd.date + 'T12:00:00');
                const formattedDate = displayDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                });

                return (
                  <div
                    key={bd.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50">
                        <CalendarOff className="h-4 w-4 text-red-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{formattedDate}</p>
                        {bd.reason && (
                          <p className="text-xs text-gray-500">{bd.reason}</p>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(bd.id)}
                      disabled={isDeleting}
                      className="text-gray-400 hover:text-red-600"
                    >
                      {isDeleting ? (
                        <Spinner size="sm" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Who's Working Today
// ---------------------------------------------------------------------------

function TodayStaffCard() {
  const [data, setData] = useState<{ employee: EmployeeBasic; schedule: EmployeeSchedule[] }[]>([]);
  const [blockedToday, setBlockedToday] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [schedRes, blockedRes] = await Promise.all([
          fetch('/api/staff/schedules'),
          fetch('/api/staff/blocked-dates'),
        ]);

        const schedJson = await schedRes.json();
        const blockedJson = await blockedRes.json();

        if (schedRes.ok) {
          setData(schedJson.schedules || []);
        }

        if (blockedRes.ok) {
          const today = new Date().toISOString().split('T')[0];
          const blockedIds = (blockedJson.blocked_dates || [])
            .filter((bd: BlockedDateRow) => bd.date === today)
            .map((bd: BlockedDateRow) => bd.employee_id)
            .filter(Boolean);
          setBlockedToday(blockedIds);
        }
      } catch (err) {
        console.error('Failed to fetch today\'s staff:', err);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </CardContent>
      </Card>
    );
  }

  const today = new Date();
  const dayOfWeek = today.getDay();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];

  const workingToday = data.filter((item) => {
    // Check if blocked today
    if (blockedToday.includes(item.employee.id)) return false;
    // Check if scheduled for today
    const todaySchedule = item.schedule.find((s) => s.day_of_week === dayOfWeek);
    return todaySchedule?.is_available;
  });

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-green-600" />
          Working Today ({dayName})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {workingToday.length === 0 ? (
          <p className="text-sm text-gray-500">No staff scheduled for today.</p>
        ) : (
          <div className="space-y-2">
            {workingToday.map((item) => {
              const todaySchedule = item.schedule.find((s) => s.day_of_week === dayOfWeek);
              return (
                <div
                  key={item.employee.id}
                  className="flex items-center justify-between rounded-md bg-green-50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium text-gray-900">
                      {item.employee.first_name} {item.employee.last_name}
                    </span>
                  </div>
                  {todaySchedule && (
                    <span className="text-xs text-gray-500">
                      {formatTime(todaySchedule.start_time)} - {formatTime(todaySchedule.end_time)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SchedulingPage() {
  const [tab, setTab] = useState('schedules');

  return (
    <div>
      <PageHeader
        title="Staff Scheduling"
        description="View staff availability and manage shop-wide blocked dates"
        action={
          <Link href="/admin/appointments">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back to Appointments
            </Button>
          </Link>
        }
      />

      {/* Today's Staff Dashboard */}
      <div className="mt-6 mb-6">
        <TodayStaffCard />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="schedules">
            <Clock className="mr-1.5 h-4 w-4" />
            Staff Schedules
          </TabsTrigger>
          <TabsTrigger value="blocked">
            <CalendarOff className="mr-1.5 h-4 w-4" />
            Shop Holidays
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedules">
          <WeeklySchedulesTab />
        </TabsContent>

        <TabsContent value="blocked">
          <BlockedDatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
