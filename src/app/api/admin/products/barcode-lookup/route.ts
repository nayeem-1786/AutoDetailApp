import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lookupProductByScanCode } from '@/lib/products/barcode-lookup';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: employee } = await admin
      .from('employees')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const barcode = typeof body?.barcode === 'string' ? body.barcode.trim() : '';
    if (!barcode) {
      return NextResponse.json({ error: 'barcode is required' }, { status: 400 });
    }

    try {
      const product = await lookupProductByScanCode(admin, barcode);
      return NextResponse.json({ product: product ?? null });
    } catch (err) {
      console.error('Admin barcode lookup error:', err);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
  } catch (err) {
    console.error('POST /admin/products/barcode-lookup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
