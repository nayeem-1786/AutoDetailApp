import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { searchCustomers } from '@/lib/search/customer-search';

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

    if (!q || q.trim().length < 2) {
      return NextResponse.json({ data: [] });
    }

    const includeDeleted = searchParams.get('include_deleted') === 'true';

    const { data: customers, error } = await searchCustomers(admin, q, {
      select: 'id, first_name, last_name, phone, email, created_at',
      limit: 10,
      includeDeleted,
    });

    if (error) {
      console.error('Admin customer search error:', error);
      return NextResponse.json({ data: [] });
    }

    return NextResponse.json({ data: customers });
  } catch (err) {
    console.error('Admin customer search error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
