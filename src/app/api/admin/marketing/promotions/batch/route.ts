import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { archiveSaleData } from '@/lib/utils/sale-history';

interface BatchItem {
  type: 'service' | 'product';
  id: string;
  sale_prices?: Record<string, number>; // tier_name → sale_price for services
  sale_price?: number; // for products
}

interface BatchRequest {
  items: BatchItem[];
  sale_starts_at: string | null;
  sale_ends_at: string | null;
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
  const body: BatchRequest = await request.json();
  const errors: { id: string; error: string }[] = [];
  let successCount = 0;

  for (const item of body.items) {
    try {
      // Archive existing sale before overwriting (non-blocking)
      try {
        await archiveSaleData({
          supabase: admin,
          serviceId: item.type === 'service' ? item.id : undefined,
          productId: item.type === 'product' ? item.id : undefined,
          endedReason: 'overwritten',
          endedBy: employee.id,
        });
      } catch (err) {
        console.error('[Promotions] Failed to archive sale history:', err);
      }

      if (item.type === 'service') {
        // Update sale dates (and flat/per_unit sale_price if provided) on service
        const svcUpdate: Record<string, unknown> = {
          sale_starts_at: body.sale_starts_at,
          sale_ends_at: body.sale_ends_at,
        };
        // For flat/per_unit models: sale_price lives on the services table
        if (item.sale_price !== undefined) {
          svcUpdate.sale_price = item.sale_price;
        }
        const { error: svcError } = await admin
          .from('services')
          .update(svcUpdate)
          .eq('id', item.id);
        if (svcError) throw svcError;

        // Update sale_price on each pricing tier (for tiered models)
        if (item.sale_prices) {
          for (const [tierName, salePrice] of Object.entries(item.sale_prices)) {
            const { error: tierError } = await admin
              .from('service_pricing')
              .update({ sale_price: salePrice })
              .eq('service_id', item.id)
              .eq('tier_name', tierName);
            if (tierError) throw tierError;
          }
        }
      } else if (item.type === 'product') {
        const { error: prodError } = await admin
          .from('products')
          .update({
            sale_price: item.sale_price ?? null,
            sale_starts_at: body.sale_starts_at,
            sale_ends_at: body.sale_ends_at,
          })
          .eq('id', item.id);
        if (prodError) throw prodError;
      }
      successCount++;
    } catch (err) {
      errors.push({ id: item.id, error: String(err) });
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    updated: successCount,
    errors,
  });
}
