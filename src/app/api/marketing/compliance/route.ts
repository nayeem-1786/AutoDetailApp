import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: employee } = await supabase
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const customerId = searchParams.get('customer_id') || '';
    const channel = searchParams.get('channel') || '';
    const search = searchParams.get('search') || '';
    const offset = (page - 1) * limit;

    let query = supabase
      .from('marketing_consent_log')
      .select('*, customers:customer_id(first_name, last_name, phone, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (customerId) query = query.eq('customer_id', customerId);
    if (channel) query = query.eq('channel', channel);

    const { data, count, error } = await query;
    if (error) throw error;

    // Filter by customer name if search provided
    let filtered = data ?? [];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((entry: { customers: { first_name: string; last_name: string } | null }) => {
        if (!entry.customers) return false;
        const fullName = `${entry.customers.first_name} ${entry.customers.last_name}`.toLowerCase();
        return fullName.includes(q);
      });
    }

    return NextResponse.json({ data: filtered, total: count ?? 0, page, limit });
  } catch (err) {
    console.error('Consent log error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
