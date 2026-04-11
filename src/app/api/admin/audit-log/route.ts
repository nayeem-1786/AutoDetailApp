import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { pstEndOfDayLiteral } from '@/lib/utils/pst-date';

export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'settings.audit_log');
    if (denied) return denied;

    const admin = createAdminClient();

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
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortDir = searchParams.get('sort_dir') || 'desc';

    const validSortColumns: Record<string, string> = {
      created_at: 'created_at',
      action: 'action',
      entity_type: 'entity_type',
      employee_name: 'employee_name',
    };
    const sortColumn = validSortColumns[sortBy] || 'created_at';

    let query = admin
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order(sortColumn, { ascending: sortDir === 'asc' });

    if (entityType) query = query.eq('entity_type', entityType);
    if (action) query = query.eq('action', action);
    if (source) query = query.eq('source', source);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) {
      // dateTo is a date string like "2026-02-22" — include the full day
      query = query.lte('created_at', pstEndOfDayLiteral(dateTo));
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
