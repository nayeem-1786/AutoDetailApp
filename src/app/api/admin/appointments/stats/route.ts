import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function GET() {
  try {
    // Auth: session + employee role check
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: employee } = await authClient
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Date boundaries
    const now = new Date();
    const todayStr = toLocalDateString(now);

    // Current week Monday - Sunday
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(monday.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const weekStartStr = toLocalDateString(monday);
    const weekEndStr = toLocalDateString(sunday);

    // 7 days ago for new bookings
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 30 days from now for booked revenue
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const thirtyDaysStr = toLocalDateString(thirtyDaysFromNow);

    // Query 1: All appointments from today to 30 days out (covers today, this week, pending, booked revenue)
    const { data: upcoming, error: upcomingError } = await supabase
      .from('appointments')
      .select('id, scheduled_date, status, total_amount, created_at')
      .gte('scheduled_date', todayStr)
      .lte('scheduled_date', thirtyDaysStr);

    if (upcomingError) {
      console.error('Error fetching upcoming appointments:', upcomingError);
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }

    // Query 2: Appointments created in last 7 days (any scheduled date, any status)
    const { data: recentlyCreated, error: recentError } = await supabase
      .from('appointments')
      .select('id')
      .gte('created_at', sevenDaysAgo.toISOString());

    if (recentError) {
      console.error('Error fetching recent bookings:', recentError);
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }

    // Aggregation
    const allUpcoming = upcoming || [];
    const nonCancelled = allUpcoming.filter(
      a => a.status !== 'cancelled' && a.status !== 'no_show'
    );

    // Today: non-cancelled appointments scheduled today
    const todayAppts = nonCancelled.filter(a => {
      const d = typeof a.scheduled_date === 'string' ? a.scheduled_date.split('T')[0] : a.scheduled_date;
      return d === todayStr;
    });
    const todayCount = todayAppts.length;
    const todayRevenue = todayAppts.reduce((sum, a) => sum + (a.total_amount || 0), 0);

    // This Week: non-cancelled appointments Mon-Sun
    const weekAppts = nonCancelled.filter(a => {
      const d = typeof a.scheduled_date === 'string' ? a.scheduled_date.split('T')[0] : a.scheduled_date;
      return d >= weekStartStr && d <= weekEndStr;
    });
    const weekCount = weekAppts.length;
    const weekRevenue = weekAppts.reduce((sum, a) => sum + (a.total_amount || 0), 0);

    // Pending: upcoming appointments with status = 'pending'
    const pendingCount = allUpcoming.filter(a => a.status === 'pending').length;

    // New Bookings: appointments created in last 7 days
    const newBookingsCount = (recentlyCreated || []).length;

    // Booked Revenue: pending + confirmed in next 30 days
    const bookedRevenue = allUpcoming
      .filter(a => a.status === 'pending' || a.status === 'confirmed')
      .reduce((sum, a) => sum + (a.total_amount || 0), 0);

    return NextResponse.json({
      today: { count: todayCount, revenue: todayRevenue },
      thisWeek: { count: weekCount, revenue: weekRevenue },
      pending: pendingCount,
      newBookings: newBookingsCount,
      bookedRevenue,
    });
  } catch (err) {
    console.error('Admin appointment stats GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
