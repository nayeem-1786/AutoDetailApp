import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const PST_TZ = 'America/Los_Angeles';

function formatPstDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: PST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function escapeCsv(value: string | null | undefined): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

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
    const entityType = searchParams.get('entity_type');
    const action = searchParams.get('action');
    const source = searchParams.get('source');
    const search = searchParams.get('search')?.trim();
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let query = admin
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (entityType) query = query.eq('entity_type', entityType);
    if (action) query = query.eq('action', action);
    if (source) query = query.eq('source', source);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) {
      const endOfDay = `${dateTo}T23:59:59.999-08:00`;
      query = query.lte('created_at', endOfDay);
    }
    if (search) {
      query = query.or(
        `entity_label.ilike.%${search}%,user_email.ilike.%${search}%,employee_name.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error('[audit-log-export] Query error:', error);
      return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }

    const rows = data || [];
    const header = 'Date,User,Employee,Action,Type,Entity,Details,Source,IP';
    const csvRows = rows.map((row) => {
      const details = row.details ? JSON.stringify(row.details) : '';
      return [
        escapeCsv(formatPstDate(row.created_at)),
        escapeCsv(row.user_email),
        escapeCsv(row.employee_name),
        escapeCsv(row.action),
        escapeCsv(row.entity_type),
        escapeCsv(row.entity_label),
        escapeCsv(details),
        escapeCsv(row.source),
        escapeCsv(row.ip_address),
      ].join(',');
    });

    const csv = [header, ...csvRows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (err) {
    console.error('[audit-log-export] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
