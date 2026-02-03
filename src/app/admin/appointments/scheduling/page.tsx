'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, Trash2, Plus, CalendarOff } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { EmployeeSchedule } from '@/lib/supabase/types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Display order: Mon(1), Tue(2), Wed(3), Thu(4), Fri(5), Sat(6), Sun(0)
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface EmployeeBasic {
  id: string;
  first_name: string;
  last_name: string;
}

interface EmployeeScheduleData {
  employee: EmployeeBasic;
  schedule: EmployeeSchedule[];
}

interface DaySchedule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
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

function buildDefaultWeek(): DaySchedule[] {
  return DISPLAY_ORDER.map((day) => ({
    day_of_week: day,
    start_time: '09:00',
    end_time: '17:00',
    is_available: day >= 1 && day <= 5, // Mon-Fri default available
  }));
}

function mergeScheduleWithDefaults(existing: EmployeeSchedule[]): DaySchedule[] {
  const defaults = buildDefaultWeek();
  const existingMap = new Map(existing.map((s) => [s.day_of_week, s]));

  return defaults.map((d) => {
    const ex = existingMap.get(d.day_of_week);
    if (ex) {
      return {
        day_of_week: ex.day_of_week,
        start_time: ex.start_time.slice(0, 5), // Ensure HH:MM format
        end_time: ex.end_time.slice(0, 5),
        is_available: ex.is_available,
      };
    }
    return d;
  });
}

// ---------------------------------------------------------------------------
// Weekly Schedules Tab
// ---------------------------------------------------------------------------

function WeeklySchedulesTab() {
  const [data, setData] = useState<EmployeeScheduleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; type: 'success' | 'error'; message: string } | null>(null);

  // Local editable state per employee
  const [editState, setEditState] = useState<Record<string, DaySchedule[]>>({});

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/staff/schedules');
      const json = await res.json();
      if (res.ok) {
        setData(json.schedules);
        // Initialize edit state
        const state: Record<string, DaySchedule[]> = {};
        for (const item of json.schedules) {
          state[item.employee.id] = mergeScheduleWithDefaults(item.schedule);
        }
        setEditState(state);
      }
    } catch (err) {
      console.error('Failed to fetch schedules:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  function updateDay(employeeId: string, dayOfWeek: number, field: keyof DaySchedule, value: string | boolean) {
    setEditState((prev) => {
      const days = [...(prev[employeeId] ?? buildDefaultWeek())];
      const idx = days.findIndex((d) => d.day_of_week === dayOfWeek);
      if (idx >= 0) {
        days[idx] = { ...days[idx], [field]: value };
      }
      return { ...prev, [employeeId]: days };
    });
  }

  async function handleSave(employeeId: string) {
    setSavingId(employeeId);
    setFeedback(null);

    const schedules = (editState[employeeId] ?? []).map((d) => ({
      day_of_week: d.day_of_week,
      start_time: d.start_time,
      end_time: d.end_time,
      is_available: d.is_available,
    }));

    try {
      const res = await fetch(`/api/staff/schedules/${employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedules }),
      });

      if (res.ok) {
        setFeedback({ id: employeeId, type: 'success', message: 'Schedule saved successfully' });
      } else {
        const json = await res.json();
        setFeedback({ id: employeeId, type: 'error', message: json.error || 'Failed to save schedule' });
      }
    } catch {
      setFeedback({ id: employeeId, type: 'error', message: 'Network error saving schedule' });
    }

    setSavingId(null);

    // Auto-clear feedback after 3 seconds
    setTimeout(() => {
      setFeedback((prev) => (prev?.id === employeeId ? null : prev));
    }, 3000);
  }

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
      />
    );
  }

  return (
    <div className="space-y-6">
      {data.map((item) => {
        const employeeId = item.employee.id;
        const days = editState[employeeId] ?? buildDefaultWeek();
        const isSaving = savingId === employeeId;
        const fb = feedback?.id === employeeId ? feedback : null;

        return (
          <Card key={employeeId}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle>
                  {item.employee.first_name} {item.employee.last_name}
                </CardTitle>
                <div className="flex items-center gap-3">
                  {fb && (
                    <span
                      className={
                        fb.type === 'success'
                          ? 'text-sm text-green-600'
                          : 'text-sm text-red-600'
                      }
                    >
                      {fb.message}
                    </span>
                  )}
                  <Button
                    onClick={() => handleSave(employeeId)}
                    disabled={isSaving}
                    size="sm"
                  >
                    {isSaving ? (
                      <>
                        <Spinner size="sm" className="text-white" />
                        Saving...
                      </>
                    ) : (
                      'Save'
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* Header row */}
                <div className="hidden sm:grid sm:grid-cols-[120px_80px_1fr_1fr] items-center gap-3 text-xs font-medium text-gray-500 uppercase tracking-wide px-1">
                  <span>Day</span>
                  <span>Available</span>
                  <span>Start Time</span>
                  <span>End Time</span>
                </div>

                {days.map((day) => (
                  <div
                    key={day.day_of_week}
                    className="grid grid-cols-1 sm:grid-cols-[120px_80px_1fr_1fr] items-center gap-2 sm:gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2.5"
                  >
                    <span className="text-sm font-medium text-gray-700">
                      {DAY_NAMES[day.day_of_week]}
                    </span>

                    <div className="flex items-center gap-2 sm:gap-0">
                      <span className="text-xs text-gray-400 sm:hidden">Available:</span>
                      <Switch
                        checked={day.is_available}
                        onCheckedChange={(val) =>
                          updateDay(employeeId, day.day_of_week, 'is_available', val)
                        }
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-400 sm:hidden whitespace-nowrap">Start:</Label>
                      <Input
                        type="time"
                        value={day.start_time}
                        onChange={(e) =>
                          updateDay(employeeId, day.day_of_week, 'start_time', e.target.value)
                        }
                        disabled={!day.is_available}
                        className="text-sm"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-400 sm:hidden whitespace-nowrap">End:</Label>
                      <Input
                        type="time"
                        value={day.end_time}
                        onChange={(e) =>
                          updateDay(employeeId, day.day_of_week, 'end_time', e.target.value)
                        }
                        disabled={!day.is_available}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocked Dates Tab
// ---------------------------------------------------------------------------

function BlockedDatesTab() {
  const [blockedDates, setBlockedDates] = useState<BlockedDateRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form state
  const [formDate, setFormDate] = useState('');
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formReason, setFormReason] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [blockedRes, schedRes] = await Promise.all([
        fetch('/api/staff/blocked-dates'),
        fetch('/api/staff/schedules'),
      ]);

      const blockedJson = await blockedRes.json();
      const schedJson = await schedRes.json();

      if (blockedRes.ok) {
        setBlockedDates(blockedJson.blocked_dates);
      }
      if (schedRes.ok) {
        setEmployees(schedJson.schedules.map((s: EmployeeScheduleData) => s.employee));
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
          employee_id: formEmployeeId || null,
          date: formDate,
          reason: formReason || null,
        }),
      });

      if (res.ok) {
        setFeedback({ type: 'success', message: 'Blocked date added' });
        setFormDate('');
        setFormEmployeeId('');
        setFormReason('');
        fetchData();
      } else {
        const json = await res.json();
        setFeedback({ type: 'error', message: json.error || 'Failed to add blocked date' });
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
            Add Blocked Date
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <Label htmlFor="blocked-employee">Employee</Label>
              <Select
                id="blocked-employee"
                value={formEmployeeId}
                onChange={(e) => setFormEmployeeId(e.target.value)}
                className="mt-1"
              >
                <option value="">All Staff</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="blocked-reason">Reason (optional)</Label>
              <Input
                id="blocked-reason"
                type="text"
                placeholder="e.g. Holiday, Vacation"
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
                    Add
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
            Blocked Dates
          </CardTitle>
        </CardHeader>
        <CardContent>
          {blockedDates.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No blocked dates"
              description="Add blocked dates to prevent bookings on specific days."
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
                        <div className="flex items-center gap-2">
                          <Badge variant={bd.employee_id ? 'info' : 'warning'}>
                            {bd.employee
                              ? `${bd.employee.first_name} ${bd.employee.last_name}`
                              : 'All Staff'}
                          </Badge>
                          {bd.reason && (
                            <span className="text-xs text-gray-500">{bd.reason}</span>
                          )}
                        </div>
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
// Main Page
// ---------------------------------------------------------------------------

export default function SchedulingPage() {
  const [tab, setTab] = useState('schedules');

  return (
    <div>
      <PageHeader
        title="Staff Scheduling"
        description="Manage employee work schedules and blocked dates"
        action={
          <Link href="/admin/appointments">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back to Appointments
            </Button>
          </Link>
        }
      />

      <div className="mt-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="schedules">
              <Clock className="mr-1.5 h-4 w-4" />
              Weekly Schedules
            </TabsTrigger>
            <TabsTrigger value="blocked">
              <CalendarOff className="mr-1.5 h-4 w-4" />
              Blocked Dates
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
    </div>
  );
}
