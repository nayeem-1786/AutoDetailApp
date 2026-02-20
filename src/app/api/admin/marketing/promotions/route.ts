import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
  const search = searchParams.get('search') || '';
  const type = searchParams.get('type') || 'all';
  const status = searchParams.get('status') || 'all';

  // Fetch services with pricing
  let services: Record<string, unknown>[] = [];
  if (type === 'all' || type === 'service') {
    let query = admin
      .from('services')
      .select('id, name, slug, pricing_model, sale_starts_at, sale_ends_at, is_active, service_pricing(id, tier_name, tier_label, price, sale_price, display_order)')
      .eq('is_active', true)
      .order('name');

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data } = await query;
    services = (data || []).map((s: Record<string, unknown>) => ({
      ...s,
      item_type: 'service',
    }));
  }

  // Fetch products
  let products: Record<string, unknown>[] = [];
  if (type === 'all' || type === 'product') {
    let query = admin
      .from('products')
      .select('id, name, slug, retail_price, sale_price, sale_starts_at, sale_ends_at, is_active')
      .eq('is_active', true)
      .order('name');

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data } = await query;
    products = (data || []).map((p: Record<string, unknown>) => ({
      ...p,
      item_type: 'product',
    }));
  }

  // Combine and apply status filter
  const now = new Date();
  const items = [...services, ...products].map((item) => {
    const starts = item.sale_starts_at ? new Date(item.sale_starts_at as string) : null;
    const ends = item.sale_ends_at ? new Date(item.sale_ends_at as string) : null;
    const hasStarted = !starts || now >= starts;
    const hasEnded = ends ? now > ends : false;

    // Check if any sale price is set
    let hasSalePrice = false;
    if (item.item_type === 'product') {
      hasSalePrice = item.sale_price !== null;
    } else {
      const tiers = (item.service_pricing || []) as { sale_price: number | null }[];
      hasSalePrice = tiers.some((t) => t.sale_price !== null);
    }

    let saleStatus: 'active' | 'scheduled' | 'expired' | 'no_sale' = 'no_sale';
    if (hasSalePrice) {
      if (hasStarted && !hasEnded) saleStatus = 'active';
      else if (!hasStarted) saleStatus = 'scheduled';
      else if (hasEnded) saleStatus = 'expired';
    }

    return { ...item, sale_status: saleStatus };
  });

  // Filter by status
  let filtered = items;
  if (status !== 'all') {
    filtered = items.filter((item) => item.sale_status === status);
  }

  // Counts
  const counts = {
    active: items.filter((i) => i.sale_status === 'active').length,
    scheduled: items.filter((i) => i.sale_status === 'scheduled').length,
    expired: items.filter((i) => i.sale_status === 'expired').length,
    no_sale: items.filter((i) => i.sale_status === 'no_sale').length,
  };

  return NextResponse.json({ data: filtered, counts }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
