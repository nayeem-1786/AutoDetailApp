import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    // Verify admin auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify employee role
    const { data: employee } = await admin
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.length < 2) {
      return NextResponse.json({ data: [] });
    }

    const term = q.trim();
    const digits = term.replace(/\D/g, '');
    const isPhoneSearch = digits.length >= 2 && digits.length === term.replace(/[\s()-]/g, '').length;

    let dbQuery = admin
      .from('customers')
      .select('id, first_name, last_name, phone')
      .order('last_name')
      .limit(10);

    if (isPhoneSearch) {
      dbQuery = dbQuery.like('phone', `%${digits}%`);
    } else {
      dbQuery = dbQuery.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
    }

    const { data: customers } = await dbQuery;

    return NextResponse.json({ data: customers ?? [] });
  } catch (err) {
    console.error('Admin customer search error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
