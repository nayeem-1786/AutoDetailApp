import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

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
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'inventory.view_expense_report');
    if (denied) return denied;

    const admin = createAdminClient();

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    let query = admin
      .from('stock_adjustments')
      .select(`
        id, created_at, quantity_change, unit_cost, reason,
        products(name, sku),
        employees!stock_adjustments_created_by_fkey(first_name, last_name)
      `)
      .eq('adjustment_type', 'shop_use')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    const { data, error } = await query;

    if (error) {
      console.error('[shop-expenses-export] Query error:', error);
      return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }

    const rows = data || [];
    const header = 'Date,Product Name,SKU,Qty Used,Unit Cost,Line Total,Note,Logged By';
    const csvRows = rows.map((row: Record<string, unknown>) => {
      const product = row.products as { name: string; sku: string | null } | null;
      const emp = row.employees as { first_name: string; last_name: string } | null;
      const qty = Math.abs(row.quantity_change as number);
      const cost = (row.unit_cost as number) ?? 0;
      const lineTotal = qty * cost;
      const reason = (row.reason as string) ?? '';
      const note = reason.replace(/^Shop use\s*—?\s*/, '');

      return [
        escapeCsv(formatPstDate(row.created_at as string)),
        escapeCsv(product?.name ?? ''),
        escapeCsv(product?.sku ?? ''),
        String(qty),
        cost > 0 ? cost.toFixed(2) : '',
        lineTotal > 0 ? lineTotal.toFixed(2) : '',
        escapeCsv(note),
        escapeCsv(emp ? `${emp.first_name} ${emp.last_name}` : ''),
      ].join(',');
    });

    const csv = [header, ...csvRows].join('\n');
    const filename = `shop-expenses-${dateFrom ?? 'all'}-to-${dateTo ?? 'now'}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[shop-expenses-export] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
