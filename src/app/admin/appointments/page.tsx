'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-provider';
import { usePermission } from '@/lib/hooks/use-permission';
import { cn } from '@/lib/utils/cn';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { formatTime } from '@/lib/utils/format';
import { AppointmentCalendar } from './components/appointment-calendar';
import { DayAppointmentsList } from './components/day-appointments-list';
import { AppointmentDetailDialog } from './components/appointment-detail-dialog';
import { CancelAppointmentDialog } from './components/cancel-appointment-dialog';
import { AppointmentStats } from './components/appointment-stats';
import { AppointmentFilters } from './components/appointment-filters';
import type { AppointmentWithRelations } from './types';
import type { Employee } from '@/lib/supabase/types';
import type { AppointmentUpdateInput, AppointmentCancelInput } from '@/lib/utils/validation';

interface AppointmentStatsData {
  today: { count: number; revenue: number };
  thisWeek: { count: number; revenue: number };
  pending: number;
  newBookings: number;
  bookedRevenue: number;
}

export default function AppointmentsPage() {
  const supabase = createClient();
  const { role } = useAuth();
  const { granted: canViewFullCalendar } = usePermission('appointments.view_calendar');
  const { granted: canReschedule } = usePermission('appointments.reschedule');
  const { granted: canCancel } = usePermission('appointments.cancel');

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Pick<Employee, 'id' | 'first_name' | 'last_name' | 'role'>[]>([]);

  // Dialog state
  const [detailOpen, setDetailOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [activeAppointment, setActiveAppointment] = useState<AppointmentWithRelations | null>(null);

  // Stats
  const [stats, setStats] = useState<AppointmentStatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Tabs
  const [activeTab, setActiveTab] = useState<'day' | 'week'>('day');

  // Client-side filtering
  const filteredAppointments = useMemo(() => {
    let filtered = appointments;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(a => a.status === statusFilter);
    }

    if (employeeFilter !== 'all') {
      if (employeeFilter === 'unassigned') {
        filtered = filtered.filter(a => !a.employee_id);
      } else {
        filtered = filtered.filter(a => a.employee_id === employeeFilter);
      }
    }

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      filtered = filtered.filter(a => {
        const name = `${a.customer?.first_name || ''} ${a.customer?.last_name || ''}`.toLowerCase();
        const phone = a.customer?.phone || '';
        return name.includes(term) || phone.includes(term);
      });
    }

    return filtered;
  }, [appointments, statusFilter, employeeFilter, search]);

  // Group filtered appointments by date for calendar dots and day list
  const appointmentsByDate: Record<string, AppointmentWithRelations[]> = useMemo(() => {
    const grouped: Record<string, AppointmentWithRelations[]> = {};
    for (const appt of filteredAppointments) {
      const key = appt.scheduled_date.split('T')[0];
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(appt);
    }
    return grouped;
  }, [filteredAppointments]);

  // Filtered appointments for selected day
  const filteredSelectedDayAppointments = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return filteredAppointments.filter(a => {
      const d = typeof a.scheduled_date === 'string' ? a.scheduled_date.split('T')[0] : '';
      return d === dateStr;
    });
  }, [filteredAppointments, selectedDate]);

  // Stats fetch
  async function fetchStats() {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/admin/appointments/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching appointment stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }

  const fetchAppointments = useCallback(async (month: Date) => {
    setLoading(true);

    if (canViewFullCalendar) {
      const { startOfMonth, endOfMonth } = await import('date-fns');
      const monthStart = format(startOfMonth(month), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customers!customer_id(id, first_name, last_name, phone, email),
          vehicle:vehicles!vehicle_id(id, year, make, model, color),
          employee:employees!employee_id(id, first_name, last_name, role),
          appointment_services(id, service_id, price_at_booking, tier_name, service:services!service_id(id, name))
        `)
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd)
        .order('scheduled_date')
        .order('scheduled_start_time');

      if (error) {
        console.error('Error loading appointments:', error);
        toast.error('Failed to load appointments');
      }

      if (data) {
        setAppointments(data as unknown as AppointmentWithRelations[]);
      }
    } else {
      const today = format(new Date(), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customers!customer_id(id, first_name, last_name, phone, email),
          vehicle:vehicles!vehicle_id(id, year, make, model, color),
          employee:employees!employee_id(id, first_name, last_name, role),
          appointment_services(id, service_id, price_at_booking, tier_name, service:services!service_id(id, name))
        `)
        .eq('scheduled_date', today)
        .order('scheduled_start_time');

      if (error) {
        console.error('Error loading appointments:', error);
        toast.error('Failed to load appointments');
      }

      if (data) {
        setAppointments(data as unknown as AppointmentWithRelations[]);
      }
    }

    setLoading(false);
  }, [supabase, canViewFullCalendar]);

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('employees')
      .select('id, first_name, last_name, role')
      .eq('status', 'active')
      .order('first_name');

    if (data) setEmployees(data);
  }, [supabase]);

  useEffect(() => {
    fetchAppointments(currentMonth);
    fetchStats();
  }, [currentMonth, fetchAppointments]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  function handleMonthChange(date: Date) {
    setCurrentMonth(date);
  }

  function handleDateSelect(date: Date) {
    setSelectedDate(date);
  }

  function handleAppointmentSelect(appointment: AppointmentWithRelations) {
    setActiveAppointment(appointment);
    setDetailOpen(true);
  }

  function handleCancelClick(appointment: AppointmentWithRelations) {
    setActiveAppointment(appointment);
    setCancelOpen(true);
  }

  function handlePendingClick() {
    setStatusFilter(prev => prev === 'pending' ? 'all' : 'pending');
  }

  async function handleSave(id: string, data: AppointmentUpdateInput): Promise<boolean> {
    try {
      const payload = {
        ...data,
        employee_id: data.employee_id || null,
      };

      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        toast.error(result.error || 'Failed to update appointment');
        return false;
      }

      toast.success('Appointment updated');
      fetchAppointments(currentMonth);
      fetchStats();
      return true;
    } catch {
      toast.error('Failed to update appointment');
      return false;
    }
  }

  async function handleCancelConfirm(id: string, data: AppointmentCancelInput): Promise<boolean> {
    try {
      const res = await fetch(`/api/appointments/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!res.ok) {
        toast.error(result.error || 'Failed to cancel appointment');
        return false;
      }

      toast.success('Appointment cancelled');
      fetchAppointments(currentMonth);
      fetchStats();
      return true;
    } catch {
      toast.error('Failed to cancel appointment');
      return false;
    }
  }

  // Detailer view: today only, no calendar — UNCHANGED
  if (!canViewFullCalendar) {
    const today = new Date();
    const todayKey = format(today, 'yyyy-MM-dd');
    const allByDate: Record<string, AppointmentWithRelations[]> = {};
    for (const appt of appointments) {
      const key = appt.scheduled_date.split('T')[0];
      if (!allByDate[key]) allByDate[key] = [];
      allByDate[key].push(appt);
    }
    const todayAppointments = allByDate[todayKey] || [];

    return (
      <div>
        <PageHeader
          title="Today's Schedule"
          description={loading ? undefined : `${todayAppointments.length} appointment${todayAppointments.length !== 1 ? 's' : ''} today`}
        />

        <div className="mt-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            {loading ? (
              <div className="flex h-60 items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <DayAppointmentsList
                selectedDate={today}
                appointments={todayAppointments}
                onSelect={handleAppointmentSelect}
              />
            )}
          </div>
        </div>

        <AppointmentDetailDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          appointment={activeAppointment}
          employees={employees}
          onSave={handleSave}
          onCancel={handleCancelClick}
          canReschedule={false}
          canCancel={false}
        />
      </div>
    );
  }

  // Week view data
  const weekStartDate = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEndDate = endOfWeek(new Date(), { weekStartsOn: 1 });
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const weekStart = format(weekStartDate, 'yyyy-MM-dd');
  const weekEnd = format(weekEndDate, 'yyyy-MM-dd');
  const weekFilteredAppts = filteredAppointments.filter((a) => {
    const d = a.scheduled_date.split('T')[0];
    return d >= weekStart && d <= weekEnd && a.status !== 'cancelled';
  });
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStartDate, i);
    const dateStr = format(d, 'yyyy-MM-dd');
    return {
      date: d,
      dateStr,
      label: format(d, 'EEE M/d'),
      isToday: dateStr === todayStr,
      appointments: weekFilteredAppts.filter((a) => a.scheduled_date.split('T')[0] === dateStr),
    };
  });

  // Full calendar view for super_admin, admin, cashier
  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        description={loading ? undefined : `${appointments.length} appointments this month`}
      />

      {/* Stats */}
      <AppointmentStats
        today={stats?.today ?? { count: 0, revenue: 0 }}
        thisWeek={stats?.thisWeek ?? { count: 0, revenue: 0 }}
        pending={stats?.pending ?? 0}
        newBookings={stats?.newBookings ?? 0}
        bookedRevenue={stats?.bookedRevenue ?? 0}
        activePendingFilter={statusFilter === 'pending'}
        onPendingClick={handlePendingClick}
        loading={statsLoading}
      />

      {/* Filters */}
      <AppointmentFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        employeeFilter={employeeFilter}
        onEmployeeChange={setEmployeeFilter}
        employees={employees}
      />

      {/* Main content: Schedule (left) + Calendar sidebar (right) */}
      <div className="grid gap-6 lg:grid-cols-[1fr,340px]">
        {/* Left: Schedule view with Day/Week tabs */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab('day')}
              className={cn(
                'px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === 'day'
                  ? 'border-b-2 border-gray-900 text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('week')}
              className={cn(
                'px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === 'week'
                  ? 'border-b-2 border-gray-900 text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Week
            </button>
          </div>

          {/* Tab content */}
          <div className="p-4">
            {activeTab === 'day' ? (
              loading ? (
                <div className="flex h-60 items-center justify-center">
                  <Spinner size="lg" />
                </div>
              ) : (
                <DayAppointmentsList
                  selectedDate={selectedDate}
                  appointments={filteredSelectedDayAppointments}
                  onSelect={handleAppointmentSelect}
                />
              )
            ) : (
              /* Week view */
              loading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map((day) => (
                    <button
                      key={day.dateStr}
                      type="button"
                      onClick={() => {
                        handleDateSelect(day.date);
                        setActiveTab('day');
                      }}
                      className={cn(
                        'rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-50 cursor-pointer',
                        day.isToday && 'border-blue-300 bg-blue-50/50'
                      )}
                    >
                      <p className={cn(
                        'text-xs font-medium text-gray-500',
                        day.isToday && 'text-blue-700'
                      )}>
                        {day.label}
                      </p>
                      <p className={cn(
                        'mt-1 text-lg font-bold tabular-nums text-gray-900',
                        day.appointments.length === 0 && 'text-gray-300'
                      )}>
                        {day.appointments.length}
                      </p>
                      {day.appointments.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {day.appointments.slice(0, 3).map((appt) => (
                            <div key={appt.id} className="flex items-center gap-1 truncate">
                              <span className={cn(
                                'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                                appt.status === 'completed' ? 'bg-green-500' :
                                appt.status === 'in_progress' ? 'bg-amber-500' :
                                appt.status === 'confirmed' ? 'bg-blue-500' :
                                'bg-gray-400'
                              )} />
                              <span className="truncate text-[10px] text-gray-600">
                                {formatTime(appt.scheduled_start_time)} {appt.customer.first_name}
                              </span>
                            </div>
                          ))}
                          {day.appointments.length > 3 && (
                            <p className="text-[10px] text-gray-400">+{day.appointments.length - 3} more</p>
                          )}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        {/* Right: Calendar sidebar */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          {loading ? (
            <div className="flex h-80 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <AppointmentCalendar
              currentMonth={currentMonth}
              selectedDate={selectedDate}
              appointmentsByDate={appointmentsByDate}
              onMonthChange={handleMonthChange}
              onDateSelect={(date) => {
                handleDateSelect(date);
                setActiveTab('day');
              }}
            />
          )}
        </div>
      </div>

      {/* Detail + Edit dialog */}
      <AppointmentDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        appointment={activeAppointment}
        employees={employees}
        onSave={handleSave}
        onCancel={handleCancelClick}
        canReschedule={canReschedule}
        canCancel={canCancel}
      />

      {/* Cancel dialog — only rendered if user has cancel permission */}
      {canCancel && (
        <CancelAppointmentDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          appointment={activeAppointment}
          onConfirm={handleCancelConfirm}
        />
      )}
    </div>
  );
}
