import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: employee } = await admin
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || employee.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const entityType = searchParams.get('entity_type');
    const action = searchParams.get('action');
    const source = searchParams.get('source');
    const search = searchParams.get('search')?.trim();
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let query = admin
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (entityType) query = query.eq('entity_type', entityType);
    if (action) query = query.eq('action', action);
    if (source) query = query.eq('source', source);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) {
      // dateTo is a date string like "2026-02-22" — include the full day
      const endOfDay = `${dateTo}T23:59:59.999-08:00`;
      query = query.lte('created_at', endOfDay);
    }
    if (search) {
      query = query.or(
        `entity_label.ilike.%${search}%,user_email.ilike.%${search}%,employee_name.ilike.%${search}%`
      );
    }

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('[audit-log] Query error:', error);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    return NextResponse.json({
      entries: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    console.error('[audit-log] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
