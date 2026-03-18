import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SaleHistoryRecord } from '@/lib/supabase/types';

export async function GET(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: employee } = await supabase
    .from('employees').select('role').eq('auth_user_id', user.id).single();
  if (!employee || !['super_admin', 'admin'].includes(employee.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get('service_id');
  const productId = searchParams.get('product_id');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = admin
    .from('sale_history')
    .select('*, services(name), products(name)', { count: 'exact' })
    .order('ended_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (serviceId) query = query.eq('service_id', serviceId);
  if (productId) query = query.eq('product_id', productId);

  const { data, count, error } = await query;

  if (error) {
    console.error('[Sale History] Query error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }

  // Map joined names to flat fields
  const records: SaleHistoryRecord[] = (data ?? []).map((row: Record<string, unknown>) => {
    const services = row.services as { name: string } | null;
    const products = row.products as { name: string } | null;
    const { services: _s, products: _p, ...rest } = row as Record<string, unknown>;
    return {
      ...rest,
      service_name: services?.name ?? undefined,
      product_name: products?.name ?? undefined,
    } as unknown as SaleHistoryRecord;
  });

  return NextResponse.json({ data: records, total: count ?? 0 });
}

export async function DELETE(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: employee } = await supabase
    .from('employees').select('role').eq('auth_user_id', user.id).single();
  if (!employee || !['super_admin', 'admin'].includes(employee.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { id } = body as { id: string };
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('sale_history')
    .delete()
    .eq('id', id)
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
