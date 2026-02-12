'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { employeeUpdateSchema, type EmployeeUpdateInput } from '@/lib/utils/validation';
import { ROLE_LABELS } from '@/lib/utils/constants';
import { formatPhoneInput } from '@/lib/utils/format';
import type { Employee, UserRole, EmployeeSchedule } from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, Calendar, Trash2, CalendarOff, Plus, ExternalLink, Loader2, Shield, ChevronDown, ChevronRight } from 'lucide-react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { cn } from '@/lib/utils/cn';

// Permission definition from API
interface PermissionDefinition {
  key: string;
  name: string;
  description: string | null;
  category: string;
  sort_order: number;
}

// Schedule constants
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun

interface DaySchedule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

function buildDefaultWeek(): DaySchedule[] {
  return DISPLAY_ORDER.map((day) => ({
    day_of_week: day,
    start_time: '09:00',
    end_time: '17:00',
    is_available: day >= 1 && day <= 5, // Mon-Fri default
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
        start_time: ex.start_time.slice(0, 5),
        end_time: ex.end_time.slice(0, 5),
        is_available: ex.is_available,
      };
    }
    return d;
  });
}

type OverrideState = 'default' | 'grant' | 'deny';

export default function StaffDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const supabase = createClient();

  // Get initial tab from URL query param (e.g., ?tab=schedule)
  const initialTab = searchParams.get('tab') || 'profile';

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  // Permissions state
  const [permissionDefinitions, setPermissionDefinitions] = useState<PermissionDefinition[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, OverrideState>>({});
  const [roleDisplayName, setRoleDisplayName] = useState('');
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Schedule state
  const [schedule, setSchedule] = useState<DaySchedule[]>(buildDefaultWeek());
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Blocked dates state
  interface BlockedDate {
    id: string;
    date: string;
    reason: string | null;
  }
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [newBlockedDate, setNewBlockedDate] = useState('');
  const [newBlockedReason, setNewBlockedReason] = useState('');
  const [addingBlocked, setAddingBlocked] = useState(false);
  const [deletingBlockedId, setDeletingBlockedId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<EmployeeUpdateInput>({
    resolver: formResolver(employeeUpdateSchema),
  });

  const bookable = watch('bookable_for_appointments');
  const pinCode = watch('pin_code');

  const loadEmployee = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      toast.error('Staff member not found');
      router.push('/admin/staff');
      return;
    }

    setEmployee(data);
    reset({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone || '',
      role: data.role,
      pin_code: data.pin_code || '',
      hourly_rate: data.hourly_rate,
      bookable_for_appointments: data.bookable_for_appointments,
    });

    // Load permissions via API, plus schedule and blocked dates
    const [permsRes, scheduleRes, blockedRes] = await Promise.all([
      adminFetch(`/api/admin/staff/${id}/permissions`).then((r) =>
        r.ok ? r.json() : null
      ),
      supabase
        .from('employee_schedules')
        .select('*')
        .eq('employee_id', id)
        .order('day_of_week'),
      supabase
        .from('blocked_dates')
        .select('id, date, reason')
        .eq('employee_id', id)
        .order('date'),
    ]);

    if (permsRes) {
      setPermissionDefinitions(permsRes.definitions || []);
      setRoleDefaults(permsRes.role_defaults || {});
      setRoleDisplayName(permsRes.role?.display_name || data.role);
      // Build overrides map from employee-specific overrides
      const ovMap: Record<string, OverrideState> = {};
      for (const [key, granted] of Object.entries(permsRes.overrides || {})) {
        ovMap[key] = granted ? 'grant' : 'deny';
      }
      setOverrides(ovMap);
    }

    // Load schedule
    if (scheduleRes.data) {
      setSchedule(mergeScheduleWithDefaults(scheduleRes.data));
    }
    setScheduleDirty(false);

    // Load blocked dates
    if (blockedRes.data) {
      setBlockedDates(blockedRes.data);
    }

    setLoading(false);
  }, [id, supabase, router, reset]);

  useEffect(() => {
    loadEmployee();
  }, [loadEmployee]);

  // Default all categories to collapsed when permission definitions load
  useEffect(() => {
    if (permissionDefinitions.length > 0) {
      const cats = new Set<string>();
      for (const d of permissionDefinitions) cats.add(d.category);
      setCollapsedCategories(cats);
    }
  }, [permissionDefinitions]);

  function toggleCollapseCategory(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function getRoleDefault(permKey: string): boolean {
    return roleDefaults[permKey] ?? false;
  }

  function getEffectiveValue(permKey: string): boolean {
    const override = overrides[permKey];
    if (override === 'grant') return true;
    if (override === 'deny') return false;
    return getRoleDefault(permKey);
  }

  // Ref to track latest overrides for debounced save
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const overrideSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setOverrideValue(permKey: string, state: OverrideState) {
    setOverrides((prev) => {
      const updated = { ...prev };
      if (state === 'default') {
        delete updated[permKey];
      } else {
        updated[permKey] = state;
      }
      return updated;
    });

    // Debounced auto-save
    if (overrideSaveTimerRef.current) clearTimeout(overrideSaveTimerRef.current);
    overrideSaveTimerRef.current = setTimeout(() => {
      debouncedSavePermissions();
    }, 300);
  }

  // Auto-save version that reads from ref
  async function debouncedSavePermissions() {
    setSavingPermissions(true);
    try {
      const payload: Array<{ key: string; granted: boolean | null }> = [];
      const current = overridesRef.current;

      for (const def of permissionDefinitions) {
        const state = current[def.key];
        if (state === 'grant') {
          payload.push({ key: def.key, granted: true });
        } else if (state === 'deny') {
          payload.push({ key: def.key, granted: false });
        } else {
          payload.push({ key: def.key, granted: null });
        }
      }

      const res = await adminFetch(`/api/admin/staff/${id}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: payload }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save permissions');
      }
    } catch (err) {
      console.error('Auto-save permissions error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save permissions');
    } finally {
      setSavingPermissions(false);
    }
  }

  async function onSaveProfile(data: EmployeeUpdateInput) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          phone: data.phone || null,
          role: data.role as UserRole,
          pin_code: data.pin_code || null,
          hourly_rate: data.hourly_rate ?? null,
          bookable_for_appointments: data.bookable_for_appointments,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to update profile');

      toast.success('Profile updated successfully');
      await loadEmployee();
    } catch (err) {
      console.error('Update employee error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!employee) return;
    setDeactivating(true);
    try {
      const newStatus = employee.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase
        .from('employees')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      toast.success(`Staff member ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      setShowDeactivate(false);
      await loadEmployee();
    } catch (err) {
      console.error('Deactivate error:', err);
      toast.error('Failed to update status');
    } finally {
      setDeactivating(false);
    }
  }

  // Build grouped permissions from definitions
  const permissionsByCategory = permissionDefinitions.reduce<
    Record<string, PermissionDefinition[]>
  >((acc, def) => {
    if (!acc[def.category]) acc[def.category] = [];
    acc[def.category].push(def);
    return acc;
  }, {});

  // Sort categories by their first item's sort_order
  const sortedCategories = Object.entries(permissionsByCategory).sort(
    ([, a], [, b]) => (a[0]?.sort_order ?? 0) - (b[0]?.sort_order ?? 0)
  );

  // Check if overrides have changed from the loaded state
  const hasOverrideChanges = permissionDefinitions.length > 0;

  async function handleSavePermissions() {
    setSavingPermissions(true);
    try {
      // Build the overrides payload — include all keys that have overrides
      // and send null for keys that were previously overridden but reverted to default
      const payload: Array<{ key: string; granted: boolean | null }> = [];

      for (const def of permissionDefinitions) {
        const state = overrides[def.key];
        if (state === 'grant') {
          payload.push({ key: def.key, granted: true });
        } else if (state === 'deny') {
          payload.push({ key: def.key, granted: false });
        } else {
          // Default — send null to clear any existing override
          payload.push({ key: def.key, granted: null });
        }
      }

      const res = await adminFetch(`/api/admin/staff/${id}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: payload }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save permissions');
      }

      toast.success('Permission overrides saved');
      await loadEmployee();
    } catch (err) {
      console.error('Save permissions error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save permissions');
    } finally {
      setSavingPermissions(false);
    }
  }

  function updateScheduleDay(dayOfWeek: number, field: keyof DaySchedule, value: string | boolean) {
    setSchedule((prev) => {
      const days = [...prev];
      const idx = days.findIndex((d) => d.day_of_week === dayOfWeek);
      if (idx >= 0) {
        days[idx] = { ...days[idx], [field]: value };
      }
      return days;
    });
    setScheduleDirty(true);
  }

  async function handleSaveSchedule() {
    setSavingSchedule(true);
    try {
      // Delete existing schedules for this employee
      const { error: deleteError } = await supabase
        .from('employee_schedules')
        .delete()
        .eq('employee_id', id);

      if (deleteError) throw deleteError;

      // Insert all schedule entries
      const rows = schedule.map((d) => ({
        employee_id: id,
        day_of_week: d.day_of_week,
        start_time: d.start_time,
        end_time: d.end_time,
        is_available: d.is_available,
      }));

      const { error: insertError } = await supabase
        .from('employee_schedules')
        .insert(rows);

      if (insertError) throw insertError;

      toast.success('Schedule saved successfully');
      setScheduleDirty(false);
    } catch (err) {
      console.error('Save schedule error:', err);
      toast.error('Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleAddBlockedDate() {
    if (!newBlockedDate) return;
    setAddingBlocked(true);
    try {
      const { data, error } = await supabase
        .from('blocked_dates')
        .insert({
          employee_id: id,
          date: newBlockedDate,
          reason: newBlockedReason || null,
        })
        .select('id, date, reason')
        .single();

      if (error) throw error;

      setBlockedDates((prev) => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)));
      setNewBlockedDate('');
      setNewBlockedReason('');
      toast.success('Blocked date added');
    } catch (err) {
      console.error('Add blocked date error:', err);
      toast.error('Failed to add blocked date');
    } finally {
      setAddingBlocked(false);
    }
  }

  async function handleDeleteBlockedDate(blockedId: string) {
    setDeletingBlockedId(blockedId);
    try {
      const { error } = await supabase
        .from('blocked_dates')
        .delete()
        .eq('id', blockedId);

      if (error) throw error;

      setBlockedDates((prev) => prev.filter((bd) => bd.id !== blockedId));
      toast.success('Blocked date removed');
    } catch (err) {
      console.error('Delete blocked date error:', err);
      toast.error('Failed to remove blocked date');
    } finally {
      setDeletingBlockedId(null);
    }
  }

  if (loading || !employee) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${employee.first_name} ${employee.last_name}`}
        description={ROLE_LABELS[employee.role]}
        action={
          <Button variant="outline" onClick={() => router.push('/admin/staff')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Staff
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          {employee.bookable_for_appointments && (
            <TabsTrigger value="schedule">
              <Calendar className="mr-1.5 h-4 w-4" />
              Schedule
            </TabsTrigger>
          )}
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <form onSubmit={handleSubmit(onSaveProfile)} className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Employee Details</CardTitle>
                  <Badge
                    variant={employee.status === 'active' ? 'success' : employee.status === 'inactive' ? 'secondary' : 'destructive'}
                  >
                    {employee.status.charAt(0).toUpperCase() + employee.status.slice(1)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField label="First Name" error={errors.first_name?.message} required htmlFor="first_name">
                    <Input id="first_name" {...register('first_name')} />
                  </FormField>

                  <FormField label="Last Name" error={errors.last_name?.message} required htmlFor="last_name">
                    <Input id="last_name" {...register('last_name')} />
                  </FormField>

                  <FormField label="Email" error={errors.email?.message} required htmlFor="email">
                    <Input id="email" type="email" {...register('email')} />
                  </FormField>

                  <FormField label="Mobile" error={errors.phone?.message} htmlFor="phone">
                    <Input
                      id="phone"
                      placeholder="(310) 555-1234"
                      {...register('phone', {
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          const formatted = formatPhoneInput(e.target.value);
                          setValue('phone', formatted, { shouldDirty: true });
                        },
                      })}
                    />
                  </FormField>

                  <FormField label="Role" error={errors.role?.message} required htmlFor="role">
                    <Select id="role" {...register('role')}>
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField label="Hourly Rate" error={errors.hourly_rate?.message} htmlFor="hourly_rate">
                    <Input
                      id="hourly_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      {...register('hourly_rate')}
                    />
                  </FormField>

                  <FormField label="POS Access" error={errors.pin_code?.message} htmlFor="pin_code" description="4-digit PIN to enable POS register login">
                    <div className="flex items-center gap-3">
                      <Input
                        id="pin_code"
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        {...register('pin_code')}
                        placeholder="1234"
                        className="w-24"
                      />
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0',
                        pinCode
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      )}>
                        <span className={cn(
                          'inline-block h-1.5 w-1.5 rounded-full',
                          pinCode ? 'bg-green-500' : 'bg-gray-400'
                        )} />
                        {pinCode ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </FormField>

                  <FormField label="Bookable for Appointments">
                    <div className="flex items-center gap-3 pt-1">
                      <Switch
                        checked={bookable ?? true}
                        onCheckedChange={(checked) => setValue('bookable_for_appointments', checked, { shouldDirty: true })}
                      />
                      <span className="text-sm text-gray-600">
                        {bookable ? 'Available for booking' : 'Not bookable'}
                      </span>
                    </div>
                  </FormField>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant={employee.status === 'active' ? 'destructive' : 'outline'}
                onClick={() => setShowDeactivate(true)}
              >
                {employee.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </Button>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => router.push('/admin/staff')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !isDirty}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </form>
        </TabsContent>

        {/* Schedule Tab */}
        {employee.bookable_for_appointments && (
          <TabsContent value="schedule">
            <Card>
              <CardHeader>
                <CardTitle>Weekly Schedule</CardTitle>
                <p className="text-sm text-gray-500">
                  Set the days and times when {employee.first_name} is available for appointments.
                  This schedule determines when customers can book services.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {/* Header row */}
                  <div className="hidden sm:grid sm:grid-cols-[140px_80px_1fr_1fr] items-center gap-3 text-xs font-medium text-gray-500 uppercase tracking-wide px-1">
                    <span>Day</span>
                    <span>Available</span>
                    <span>Start Time</span>
                    <span>End Time</span>
                  </div>

                  {schedule.map((day) => (
                    <div
                      key={day.day_of_week}
                      className="grid grid-cols-1 sm:grid-cols-[140px_80px_1fr_1fr] items-center gap-2 sm:gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2.5"
                    >
                      <span className="text-sm font-medium text-gray-700">
                        {DAY_NAMES[day.day_of_week]}
                      </span>

                      <div className="flex items-center gap-2 sm:gap-0">
                        <span className="text-xs text-gray-400 sm:hidden">Available:</span>
                        <Switch
                          checked={day.is_available}
                          onCheckedChange={(val) =>
                            updateScheduleDay(day.day_of_week, 'is_available', val)
                          }
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 sm:hidden whitespace-nowrap">Start:</span>
                        <Input
                          type="time"
                          value={day.start_time}
                          onChange={(e) =>
                            updateScheduleDay(day.day_of_week, 'start_time', e.target.value)
                          }
                          disabled={!day.is_available}
                          className="text-sm"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 sm:hidden whitespace-nowrap">End:</span>
                        <Input
                          type="time"
                          value={day.end_time}
                          onChange={(e) =>
                            updateScheduleDay(day.day_of_week, 'end_time', e.target.value)
                          }
                          disabled={!day.is_available}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex justify-end border-t border-gray-200 pt-4">
                  <Button
                    onClick={handleSaveSchedule}
                    disabled={savingSchedule || !scheduleDirty}
                  >
                    {savingSchedule ? 'Saving...' : 'Save Schedule'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Blocked Dates */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarOff className="h-4 w-4" />
                  Time Off / Blocked Dates
                </CardTitle>
                <p className="text-sm text-gray-500">
                  Block specific dates when {employee.first_name} is unavailable (vacation, sick days, etc.)
                </p>
              </CardHeader>
              <CardContent>
                {/* Add blocked date form */}
                <div className="flex flex-wrap items-end gap-3 pb-4 border-b border-gray-100">
                  <div>
                    <label htmlFor="blocked-date" className="block text-xs font-medium text-gray-500 mb-1">
                      Date
                    </label>
                    <Input
                      id="blocked-date"
                      type="date"
                      value={newBlockedDate}
                      onChange={(e) => setNewBlockedDate(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <label htmlFor="blocked-reason" className="block text-xs font-medium text-gray-500 mb-1">
                      Reason (optional)
                    </label>
                    <Input
                      id="blocked-reason"
                      type="text"
                      placeholder="e.g., Vacation, Doctor's appointment"
                      value={newBlockedReason}
                      onChange={(e) => setNewBlockedReason(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleAddBlockedDate}
                    disabled={!newBlockedDate || addingBlocked}
                    size="sm"
                  >
                    {addingBlocked ? (
                      <Spinner size="sm" className="text-white" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add
                  </Button>
                </div>

                {/* List of blocked dates */}
                {blockedDates.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">
                    No blocked dates. {employee.first_name} is available on all scheduled days.
                  </p>
                ) : (
                  <div className="divide-y divide-gray-100 mt-3">
                    {blockedDates.map((bd) => {
                      const dateObj = new Date(bd.date + 'T12:00:00');
                      const formattedDate = dateObj.toLocaleDateString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      });
                      const isPast = new Date(bd.date) < new Date(new Date().toDateString());

                      return (
                        <div
                          key={bd.id}
                          className={`flex items-center justify-between py-2.5 ${isPast ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-center gap-3">
                            <CalendarOff className="h-4 w-4 text-red-400" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{formattedDate}</p>
                              {bd.reason && (
                                <p className="text-xs text-gray-500">{bd.reason}</p>
                              )}
                            </div>
                            {isPast && (
                              <Badge variant="secondary">Past</Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteBlockedDate(bd.id)}
                            disabled={deletingBlockedId === bd.id}
                            className="text-gray-400 hover:text-red-600"
                          >
                            {deletingBlockedId === bd.id ? (
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
          </TabsContent>
        )}

        {/* Permission Overrides Tab */}
        <TabsContent value="permissions">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>Permission Overrides</CardTitle>
                      {savingPermissions && (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      Override defaults from this employee&apos;s role.
                      Leave as &quot;Default&quot; to inherit role settings.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>Role:</span>
                    <Badge variant="info">{roleDisplayName}</Badge>
                    <a
                      href="/admin/staff/roles"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View role defaults
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Super Admin banner */}
                {employee.role === 'super_admin' && (
                  <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <Shield className="h-5 w-5 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800">
                      Super Admin bypasses all permission checks. Overrides have no effect.
                    </p>
                  </div>
                )}

                {sortedCategories.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="sm" />
                    <span className="ml-2 text-sm text-gray-400">Loading permissions...</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedCategories.map(([category, definitions]) => {
                      const overrideCount = definitions.filter(
                        (d) => overrides[d.key] === 'grant' || overrides[d.key] === 'deny'
                      ).length;
                      const isCollapsed = collapsedCategories.has(category);

                      return (
                        <div key={category} className="rounded-lg border border-gray-200">
                          {/* Category Header — clickable to collapse */}
                          <button
                            type="button"
                            onClick={() => toggleCollapseCategory(category)}
                            className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              )}
                              <span className="text-sm font-semibold text-gray-900">
                                {category}
                              </span>
                              {overrideCount > 0 && (
                                <Badge variant="info" className="text-[10px] px-1.5 py-0">
                                  {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                                </Badge>
                              )}
                            </div>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {definitions.length}
                            </Badge>
                          </button>

                          {/* Permission Rows */}
                          {!isCollapsed && (
                            <div className="border-t border-gray-100">
                              {definitions.map((def, idx) => {
                                const overrideState = overrides[def.key] || 'default';
                                const roleDefault = getRoleDefault(def.key);
                                const isSuperAdmin = employee.role === 'super_admin';

                                return (
                                  <div
                                    key={def.key}
                                    className={cn(
                                      'flex items-center justify-between px-4 py-1.5 gap-3',
                                      idx % 2 === 1 && 'bg-gray-50/60'
                                    )}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-700">
                                          {def.name}
                                        </span>
                                        <span className={cn(
                                          'inline-block h-1.5 w-1.5 rounded-full shrink-0',
                                          getEffectiveValue(def.key) ? 'bg-green-500' : 'bg-red-400'
                                        )} title={`Effective: ${getEffectiveValue(def.key) ? 'Granted' : 'Denied'}`} />
                                      </div>
                                      {def.description && (
                                        <p className="text-xs text-gray-400 hidden sm:block">
                                          {def.description}
                                        </p>
                                      )}
                                    </div>

                                    {/* Click-to-cycle pill: Default → Granted → Denied → Default */}
                                    <button
                                      type="button"
                                      disabled={isSuperAdmin}
                                      onClick={() => {
                                        const next: Record<OverrideState, OverrideState> = {
                                          default: 'grant',
                                          grant: 'deny',
                                          deny: 'default',
                                        };
                                        setOverrideValue(def.key, next[overrideState]);
                                      }}
                                      className={cn(
                                        'shrink-0 rounded-full px-3 py-0.5 text-xs font-medium transition-colors',
                                        overrideState === 'default' && 'bg-gray-100 text-gray-500',
                                        overrideState === 'grant' && 'bg-green-100 text-green-700',
                                        overrideState === 'deny' && 'bg-red-100 text-red-700',
                                        isSuperAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'
                                      )}
                                    >
                                      {overrideState === 'default' && 'Default'}
                                      {overrideState === 'grant' && 'Granted'}
                                      {overrideState === 'deny' && 'Denied'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={showDeactivate}
        onOpenChange={setShowDeactivate}
        title={employee.status === 'active' ? 'Deactivate Staff Member' : 'Reactivate Staff Member'}
        description={
          employee.status === 'active'
            ? `Are you sure you want to deactivate ${employee.first_name} ${employee.last_name}? They will lose access to the system but their account will not be deleted.`
            : `Reactivate ${employee.first_name} ${employee.last_name}? They will regain access to the system.`
        }
        confirmLabel={employee.status === 'active' ? 'Deactivate' : 'Reactivate'}
        variant={employee.status === 'active' ? 'destructive' : 'default'}
        loading={deactivating}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
