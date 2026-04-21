import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    const { data: product, error } = await admin
      .from('products')
      .select('*')
      .eq('barcode', barcode)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Admin barcode lookup error:', error);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }

    return NextResponse.json({ product: product ?? null });
  } catch (err) {
    console.error('POST /admin/products/barcode-lookup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
