import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    const adminClient = createAdminClient();

    const { data: customers, error } = await adminClient
      .from('customers')
      .select('id, email, phone, visit_count, lifetime_spend, last_visit_date, created_at, customer_type')
      .limit(10000);

    if (error) {
      console.error('Error fetching customers:', error);
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }

    // Aggregation
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgoStr = `${ninetyDaysAgo.getFullYear()}-${String(ninetyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(ninetyDaysAgo.getDate()).padStart(2, '0')}`;

    const all = customers || [];
    const total = all.length;
    const newThisMonth = all.filter(c => c.created_at && c.created_at >= monthStart).length;
    const repeatCount = all.filter(c => c.visit_count >= 2).length;
    const repeatRate = total > 0 ? Math.round((repeatCount / total) * 100) : 0;
    const lifetimeRevenue = all.reduce((sum, c) => sum + (Number(c.lifetime_spend) || 0), 0);
    const avgPerCustomer = total > 0 ? Math.round((lifetimeRevenue / total) * 100) / 100 : 0;
    const atRiskCount = all.filter(c => c.last_visit_date && c.last_visit_date <= ninetyDaysAgoStr).length;
    const uncategorizedCount = all.filter(c => !c.customer_type).length;

    return NextResponse.json({
      total,
      newThisMonth,
      repeatCount,
      repeatRate,
      lifetimeRevenue,
      avgPerCustomer,
      atRiskCount,
      uncategorizedCount,
    });
  } catch (err) {
    console.error('Admin customer stats GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
