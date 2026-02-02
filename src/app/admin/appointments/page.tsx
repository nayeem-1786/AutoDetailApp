'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { AppointmentCalendar } from './components/appointment-calendar';
import { DayAppointmentsList } from './components/day-appointments-list';
import { AppointmentDetailDialog } from './components/appointment-detail-dialog';
import { CancelAppointmentDialog } from './components/cancel-appointment-dialog';
import type { AppointmentWithRelations } from './types';
import type { Employee } from '@/lib/supabase/types';
import type { AppointmentUpdateInput, AppointmentCancelInput } from '@/lib/utils/validation';

export default function AppointmentsPage() {
  const supabase = createClient();
  const { role } = useAuth();

  // Permission flags based on PROJECT.md permission matrix
  const canViewFullCalendar = role === 'super_admin' || role === 'admin' || role === 'cashier';
  const canReschedule = role === 'super_admin' || role === 'admin' || role === 'cashier';
  const canCancel = role === 'super_admin' || role === 'admin';

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Pick<Employee, 'id' | 'first_name' | 'last_name' | 'role'>[]>([]);

  // Dialog state
  const [detailOpen, setDetailOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [activeAppointment, setActiveAppointment] = useState<AppointmentWithRelations | null>(null);

  // Group appointments by date for O(1) lookup
  const appointmentsByDate: Record<string, AppointmentWithRelations[]> = {};
  for (const appt of appointments) {
    const key = appt.scheduled_date;
    if (!appointmentsByDate[key]) appointmentsByDate[key] = [];
    appointmentsByDate[key].push(appt);
  }

  const selectedDateKey = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
  const selectedDayAppointments = appointmentsByDate[selectedDateKey] || [];

  const fetchAppointments = useCallback(async (month: Date) => {
    setLoading(true);

    if (canViewFullCalendar) {
      // Full month fetch for calendar view
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
      // Detailer: today only
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
      return true;
    } catch {
      toast.error('Failed to cancel appointment');
      return false;
    }
  }

  // Detailer view: today only, no calendar
  if (!canViewFullCalendar) {
    const today = new Date();
    const todayKey = format(today, 'yyyy-MM-dd');
    const todayAppointments = appointmentsByDate[todayKey] || [];

    return (
      <div>
        <PageHeader
          title="Today's Schedule"
          description={loading ? 'Loading...' : `${todayAppointments.length} appointment${todayAppointments.length !== 1 ? 's' : ''} today`}
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

  // Full calendar view for super_admin, admin, cashier
  return (
    <div>
      <PageHeader
        title="Appointments"
        description={loading ? 'Loading...' : `${appointments.length} appointments this month`}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr,400px]">
        {/* Calendar */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
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
              onDateSelect={handleDateSelect}
            />
          )}
        </div>

        {/* Day detail panel */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <DayAppointmentsList
            selectedDate={selectedDate}
            appointments={selectedDayAppointments}
            onSelect={handleAppointmentSelect}
          />
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
