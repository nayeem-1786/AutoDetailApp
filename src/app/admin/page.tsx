'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  CalendarDays,
  Users,
  Package,
  Settings,
  ArrowRight,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { formatTime } from '@/lib/utils/format';
import { APPOINTMENT_STATUS_LABELS } from '@/lib/utils/constants';
import type { AppointmentStatus } from '@/lib/supabase/types';

interface TodayAppointment {
  id: string;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  status: AppointmentStatus;
  customer: { first_name: string; last_name: string };
  vehicle: { year: number | null; make: string | null; model: string | null } | null;
  employee: { first_name: string; last_name: string } | null;
  appointment_services: { service: { name: string } }[];
}

const STATUS_BADGE_VARIANT: Record<AppointmentStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info'> = {
  pending: 'warning',
  confirmed: 'info',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'destructive',
  no_show: 'secondary',
};

export default function AdminDashboard() {
  const { employee, role } = useAuth();
  const supabase = createClient();
  const [appointments, setAppointments] = useState<TodayAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const today = format(new Date(), 'yyyy-MM-dd');

  const fetchTodayAppointments = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('appointments')
      .select(`
        id, scheduled_date, scheduled_start_time, scheduled_end_time, status,
        customer:customers!customer_id(first_name, last_name),
        vehicle:vehicles!vehicle_id(year, make, model),
        employee:employees!employee_id(first_name, last_name),
        appointment_services(service:services!service_id(name))
      `)
      .eq('scheduled_date', today)
      .neq('status', 'cancelled')
      .order('scheduled_start_time');

    if (data) {
      setAppointments(data as unknown as TodayAppointment[]);
    }
    setLoading(false);
  }, [supabase, today]);

  useEffect(() => {
    fetchTodayAppointments();
  }, [fetchTodayAppointments]);

  const pending = appointments.filter((a) => a.status === 'pending').length;
  const confirmed = appointments.filter((a) => a.status === 'confirmed').length;
  const inProgress = appointments.filter((a) => a.status === 'in_progress').length;
  const completed = appointments.filter((a) => a.status === 'completed').length;
  const remaining = pending + confirmed + inProgress;

  // Role-appropriate quick actions
  const quickActions: { label: string; href: string; icon: typeof CalendarDays; description: string }[] = [];

  if (role === 'detailer') {
    quickActions.push({ label: 'My Schedule', href: '/admin/appointments', icon: CalendarDays, description: "View today's appointments" });
  } else {
    quickActions.push({ label: 'Appointments', href: '/admin/appointments', icon: CalendarDays, description: 'Manage the appointment calendar' });
    quickActions.push({ label: 'Customers', href: '/admin/customers', icon: Users, description: 'View and manage customers' });
  }

  if (role === 'super_admin' || role === 'admin') {
    quickActions.push({ label: 'Catalog', href: '/admin/catalog', icon: Package, description: 'Products and services' });
  }

  if (role === 'super_admin') {
    quickActions.push({ label: 'Settings', href: '/admin/settings', icon: Settings, description: 'System configuration' });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${employee?.first_name || 'User'}`}
        description={format(new Date(), 'EEEE, MMMM d, yyyy')}
      />

      {/* Stats row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <CalendarDays className="h-4 w-4" />
              Today&apos;s Appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Spinner />
            ) : (
              <p className="text-2xl font-bold">{appointments.length}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <Clock className="h-4 w-4" />
              Remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Spinner />
            ) : (
              <p className="text-2xl font-bold text-blue-600">{remaining}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <Loader2 className="h-4 w-4" />
              In Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Spinner />
            ) : (
              <p className="text-2xl font-bold text-amber-600">{inProgress}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-500">
              <CheckCircle2 className="h-4 w-4" />
              Completed Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Spinner />
            ) : (
              <p className="text-2xl font-bold text-green-600">{completed}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
        {/* Today's schedule */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Today&apos;s Schedule</h3>
            <Link
              href="/admin/appointments"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {role === 'detailer' ? 'View All' : 'View Calendar'}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="mt-6 flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : appointments.length === 0 ? (
            <div className="mt-4 flex items-center justify-center rounded-lg border border-dashed border-gray-300 p-8">
              <p className="text-sm text-gray-400">No appointments scheduled for today</p>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {appointments.map((appt) => {
                const services = appt.appointment_services
                  .map((as) => as.service?.name || 'Service')
                  .join(', ');

                return (
                  <div
                    key={appt.id}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {formatTime(appt.scheduled_start_time)}
                        {' - '}
                        {formatTime(appt.scheduled_end_time)}
                      </span>
                      <Badge variant={STATUS_BADGE_VARIANT[appt.status]}>
                        {APPOINTMENT_STATUS_LABELS[appt.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-gray-700">
                      {appt.customer.first_name} {appt.customer.last_name}
                    </p>
                    <p className="truncate text-xs text-gray-500">{services}</p>
                    {appt.vehicle && (
                      <p className="truncate text-xs text-gray-400">
                        {[appt.vehicle.year, appt.vehicle.make, appt.vehicle.model]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                    )}
                    {appt.employee && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        Detailer: {appt.employee.first_name} {appt.employee.last_name}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
            <div className="mt-3 space-y-2">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  <action.icon className="h-4 w-4 text-gray-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{action.label}</p>
                    <p className="truncate text-xs text-gray-500">{action.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Alerts placeholder for pending confirmations */}
          {!loading && pending > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-amber-900">Needs Attention</h3>
              </div>
              <p className="mt-1 text-xs text-amber-700">
                {pending} appointment{pending !== 1 ? 's' : ''} pending confirmation
              </p>
              <Link
                href="/admin/appointments"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900"
              >
                Review <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
