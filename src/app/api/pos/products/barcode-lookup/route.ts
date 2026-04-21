import { NextRequest, NextResponse } from 'next/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { lookupProductByScanCode } from '@/lib/products/barcode-lookup';

export async function POST(request: NextRequest) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const barcode = (body.barcode ?? '').trim();

    if (!barcode) {
      return NextResponse.json({ error: 'Barcode is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    let product;
    try {
      product = await lookupProductByScanCode(supabase, barcode);
    } catch (err) {
      console.error('[Barcode Lookup] Query error:', err);
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
