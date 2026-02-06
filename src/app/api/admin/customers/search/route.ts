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

    const query = q.toLowerCase();
    const digits = q.replace(/\D/g, '');

    // Search by name or phone
    let customers;
    if (digits.length >= 4) {
      // Search by phone
      const { data } = await admin
        .from('customers')
        .select('id, first_name, last_name, phone')
        .like('phone', `%${digits}`)
        .order('last_name')
        .limit(10);
      customers = data;
    } else {
      // Search by name
      const { data } = await admin
        .from('customers')
        .select('id, first_name, last_name, phone')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .order('last_name')
        .limit(10);
      customers = data;
    }

    return NextResponse.json({ data: customers ?? [] });
  } catch (err) {
    console.error('Admin customer search error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
