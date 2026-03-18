import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { archiveSaleData } from '@/lib/utils/sale-history';

interface ClearRequest {
  items: { type: 'service' | 'product'; id: string }[];
}

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: employee } = await supabase
    .from('employees').select('id, role').eq('auth_user_id', user.id).single();
  if (!employee || !['super_admin', 'admin'].includes(employee.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const body: ClearRequest = await request.json();
  let cleared = 0;

  for (const item of body.items) {
    // Archive before clearing (non-blocking)
    try {
      await archiveSaleData({
        supabase: admin,
        serviceId: item.type === 'service' ? item.id : undefined,
        productId: item.type === 'product' ? item.id : undefined,
        endedReason: 'manual',
        endedBy: employee.id,
      });
    } catch (err) {
      console.error('[Promotions] Failed to archive sale history:', err);
    }

    if (item.type === 'service') {
      // Clear sale dates and flat/per_unit sale_price on service
      await admin
        .from('services')
        .update({ sale_price: null, sale_starts_at: null, sale_ends_at: null })
        .eq('id', item.id);

      // Clear sale_price on all pricing rows
      await admin
        .from('service_pricing')
        .update({ sale_price: null })
        .eq('service_id', item.id);
    } else {
      await admin
        .from('products')
        .update({ sale_price: null, sale_starts_at: null, sale_ends_at: null })
        .eq('id', item.id);
    }
    cleared++;
  }

  return NextResponse.json({ success: true, cleared });
}
