'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns';
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
  FileText,
  UserPlus,
  TrendingUp,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { formatTime, formatCurrency } from '@/lib/utils/format';
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

interface WeekDay {
  date: string; // YYYY-MM-DD
  label: string; // "Mon 2/10"
  isToday: boolean;
  appointments: TodayAppointment[];
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
  const [weekAppointments, setWeekAppointments] = useState<TodayAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [quoteStats, setQuoteStats] = useState({ draft: 0, sent: 0, viewed: 0, accepted: 0 });
  const [customerStats, setCustomerStats] = useState({ total: 0, newThisWeek: 0, newThisMonth: 0 });
  const today = format(new Date(), 'yyyy-MM-dd');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');

    const [todayRes, weekRes, quotesRes, custTotalRes, custWeekRes, custMonthRes] = await Promise.all([
      // Today's appointments
      supabase
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
        .order('scheduled_start_time'),

      // This week's appointments (for Week at a Glance)
      supabase
        .from('appointments')
        .select(`
          id, scheduled_date, scheduled_start_time, scheduled_end_time, status,
          customer:customers!customer_id(first_name, last_name),
          vehicle:vehicles!vehicle_id(year, make, model),
          employee:employees!employee_id(first_name, last_name),
          appointment_services(service:services!service_id(name))
        `)
        .gte('scheduled_date', weekStart)
        .lte('scheduled_date', weekEnd)
        .neq('status', 'cancelled')
        .order('scheduled_start_time'),

      // Open quotes by status
      supabase
        .from('quotes')
        .select('status')
        .in('status', ['draft', 'sent', 'viewed', 'accepted']),

      // Total customers
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true }),

      // New customers this week
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', `${weekStart}T00:00:00`),

      // New customers this month
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', `${monthStart}T00:00:00`),
    ]);

    if (todayRes.data) {
      setAppointments(todayRes.data as unknown as TodayAppointment[]);
    }
    if (weekRes.data) {
      setWeekAppointments(weekRes.data as unknown as TodayAppointment[]);
    }
    if (quotesRes.data) {
      const counts = { draft: 0, sent: 0, viewed: 0, accepted: 0 };
      quotesRes.data.forEach((q: { status: string }) => {
        if (q.status in counts) counts[q.status as keyof typeof counts]++;
      });
      setQuoteStats(counts);
    }
    setCustomerStats({
      total: custTotalRes.count ?? 0,
      newThisWeek: custWeekRes.count ?? 0,
      newThisMonth: custMonthRes.count ?? 0,
    });

    setLoading(false);
  }, [supabase, today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pending = appointments.filter((a) => a.status === 'pending').length;
  const confirmed = appointments.filter((a) => a.status === 'confirmed').length;
  const inProgress = appointments.filter((a) => a.status === 'in_progress').length;
  const completed = appointments.filter((a) => a.status === 'completed').length;
  const remaining = pending + confirmed + inProgress;

  // Build week days for "Week at a Glance"
  const weekDays: WeekDay[] = [];
  const weekStartDate = startOfWeek(new Date(), { weekStartsOn: 1 });
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStartDate, i);
    const dateStr = format(d, 'yyyy-MM-dd');
    weekDays.push({
      date: dateStr,
      label: format(d, 'EEE M/d'),
      isToday: dateStr === today,
      appointments: weekAppointments.filter((a) => a.scheduled_date?.split('T')[0] === dateStr),
    });
  }

  const totalOpenQuotes = quoteStats.sent + quoteStats.viewed + quoteStats.accepted;

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

      {/* Quotes & Customers quick stats */}
      {role !== 'detailer' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link href="/admin/quotes" className="group">
            <Card className="transition-colors group-hover:border-gray-300">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-blue-50 p-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{loading ? '-' : totalOpenQuotes}</p>
                  <p className="text-xs text-gray-500">Open Quotes</p>
                </div>
                {!loading && quoteStats.accepted > 0 && (
                  <Badge variant="success" className="ml-auto">{quoteStats.accepted} accepted</Badge>
                )}
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/quotes?status=draft" className="group">
            <Card className="transition-colors group-hover:border-gray-300">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-gray-100 p-2">
                  <FileText className="h-5 w-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{loading ? '-' : quoteStats.draft}</p>
                  <p className="text-xs text-gray-500">Drafts</p>
                </div>
                {!loading && quoteStats.sent > 0 && (
                  <span className="ml-auto text-xs text-gray-400">{quoteStats.sent} sent</span>
                )}
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/customers" className="group">
            <Card className="transition-colors group-hover:border-gray-300">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-green-50 p-2">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{loading ? '-' : customerStats.total}</p>
                  <p className="text-xs text-gray-500">Total Customers</p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-purple-50 p-2">
                <UserPlus className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{loading ? '-' : customerStats.newThisMonth}</p>
                <p className="text-xs text-gray-500">New This Month</p>
              </div>
              {!loading && customerStats.newThisWeek > 0 && (
                <span className="ml-auto text-xs text-gray-400">{customerStats.newThisWeek} this week</span>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Week at a Glance */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Week at a Glance</h3>
          <Link
            href="/admin/appointments"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            View Calendar
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {loading ? (
          <div className="mt-4 flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-7 gap-2">
            {weekDays.map((day) => (
              <div
                key={day.date}
                className={`rounded-lg border p-2 ${
                  day.isToday
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <p className={`text-xs font-medium ${day.isToday ? 'text-blue-700' : 'text-gray-500'}`}>
                  {day.label}
                </p>
                <p className={`mt-1 text-lg font-bold ${
                  day.appointments.length === 0 ? 'text-gray-300' : day.isToday ? 'text-blue-700' : 'text-gray-900'
                }`}>
                  {day.appointments.length}
                </p>
                {day.appointments.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {day.appointments.slice(0, 3).map((appt) => (
                      <div key={appt.id} className="flex items-center gap-1 truncate">
                        <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                          appt.status === 'completed' ? 'bg-green-500' :
                          appt.status === 'in_progress' ? 'bg-amber-500' :
                          appt.status === 'confirmed' ? 'bg-blue-500' :
                          'bg-gray-400'
                        }`} />
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
              </div>
            ))}
          </div>
        )}
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
