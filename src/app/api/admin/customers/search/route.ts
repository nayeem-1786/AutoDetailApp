import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const denied = await requirePermission(employee.id, 'customers.view');
    if (denied) return denied;

    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.length < 2) {
      return NextResponse.json({ data: [] });
    }

    const term = q.trim();
    const digits = term.replace(/\D/g, '');
    const isPhoneSearch = digits.length >= 2 && digits.length === term.replace(/[\s()-]/g, '').length;

    const includeSoftDeleted = searchParams.get('include_deleted') === 'true';

    let dbQuery = admin
      .from('customers')
      .select('id, first_name, last_name, phone, email, created_at')
      .order('last_name')
      .limit(10);

    if (!includeSoftDeleted) {
      dbQuery = dbQuery.is('deleted_at', null);
    }

    if (isPhoneSearch) {
      dbQuery = dbQuery.like('phone', `%${digits}%`);
    } else {
      dbQuery = dbQuery.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`);
    }

    const { data: customers } = await dbQuery;

    return NextResponse.json({ data: customers ?? [] });
  } catch (err) {
    console.error('Admin customer search error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
