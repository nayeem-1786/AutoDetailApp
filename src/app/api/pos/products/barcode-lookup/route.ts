import { NextRequest, NextResponse } from 'next/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const barcode = (body.barcode ?? '').trim();

    if (!barcode) {
      return NextResponse.json({ error: 'Barcode is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Look up by barcode first, then fall back to SKU
    const { data: product, error } = await supabase
      .from('products')
      .select('id, name, sku, barcode, retail_price, cost_price, is_taxable, is_active, quantity_on_hand, image_url, category_id, is_loyalty_eligible, sale_price, sale_starts_at, sale_ends_at')
      .or(`barcode.eq.${barcode},sku.eq.${barcode}`)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Barcode Lookup] Query error:', error);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found', barcode },
        { status: 404 }
      );
    }

    return NextResponse.json({ product });
  } catch (err) {
    console.error('[Barcode Lookup] Error:', err);
    return NextResponse.json(
      { error: 'Barcode lookup failed' },
      { status: 500 }
    );
  }
}
