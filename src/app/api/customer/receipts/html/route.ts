import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateReceiptHtml, fetchLogoAsBase64 } from '@/app/pos/lib/receipt-template';
import { fetchReceiptData } from '@/lib/data/receipt-data';

/**
 * GET /api/customer/receipts/html?transaction_id=...
 * Returns server-rendered receipt HTML for the customer portal.
 * Authenticates via customer session and verifies ownership.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const transactionId = request.nextUrl.searchParams.get('transaction_id');
    if (!transactionId) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify customer owns this transaction
    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Check transaction belongs to this customer
    const { data: txCheck } = await admin
      .from('transactions')
      .select('id')
      .eq('id', transactionId)
      .eq('customer_id', customer.id)
      .single();

    if (!txCheck) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const { tx, config, images } = await fetchReceiptData(admin, transactionId);
    // Inline logo as base64 for customer portal receipt (no external network dependency)
    if (config.logo_url) {
      images.logoBase64 = await fetchLogoAsBase64(config.logo_url) ?? undefined;
    }
    const html = generateReceiptHtml(tx, config, images);

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('Customer receipt HTML error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message === 'Transaction not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
