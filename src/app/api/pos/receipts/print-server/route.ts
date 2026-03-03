import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { generateReceiptLines, receiptToEscPos } from '@/app/pos/lib/receipt-template';
import { fetchReceiptConfig } from '@/lib/data/receipt-config';
// TODO: Logo printing disabled — Star TSP100III doesn't recognize standard
// GS v 0 raster command; bytes print as gibberish text. Need to use Star-specific
// ESC GS S / ESC * bit-image commands instead. See escpos-logo.ts for the
// conversion logic (sharp-based, works server-side).

export async function POST(request: NextRequest) {
  try {
    // Accept POS token auth OR admin Supabase session auth
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      const supabaseSession = await createClient();
      const { data: { user } } = await supabaseSession.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const { transaction_id } = body;

    if (!transaction_id) {
      return NextResponse.json(
        { error: 'transaction_id is required' },
        { status: 400 }
      );
    }

    // Fetch transaction with full relations
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select(`
        *,
        customer:customers(first_name, last_name, phone, email, customer_type, created_at),
        employee:employees(first_name, last_name),
        vehicle:vehicles(year, make, model, color),
        items:transaction_items(*),
        payments(*)
      `)
      .eq('id', transaction_id)
      .single();

    if (error || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Fetch dynamic receipt config
    const { merged, print_server_url } = await fetchReceiptConfig(supabase);

    if (!print_server_url) {
      console.error('print_server_url is null — receipt_config may not have been saved with this field yet');
      return NextResponse.json(
        { error: 'Print server not configured. Set Print Server URL in Settings > Receipt Printer.' },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = transaction as any;
    const receiptLines = generateReceiptLines({
      receipt_number: tx.receipt_number,
      transaction_date: tx.transaction_date,
      subtotal: tx.subtotal,
      tax_amount: tx.tax_amount,
      discount_amount: tx.discount_amount,
      coupon_code: tx.coupon_code,
      loyalty_discount: tx.loyalty_discount,
      loyalty_points_redeemed: tx.loyalty_points_redeemed,
      tip_amount: tx.tip_amount,
      total_amount: tx.total_amount,
      customer: tx.customer,
      employee: tx.employee,
      vehicle: tx.vehicle,
      items: tx.items ?? [],
      payments: tx.payments ?? [],
    }, merged);

    // Logo images skipped — no imageData passed, so receiptToEscPos silently
    // skips image lines. See TODO at top of file for Star raster command issue.
    const escPosData = receiptToEscPos(receiptLines);

    // Send binary data to local print server with 3-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const printRes = await fetch(`${print_server_url}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Buffer.from(escPosData),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!printRes.ok) {
        const errText = await printRes.text().catch(() => 'Unknown error');
        return NextResponse.json(
          { error: `Print server error: ${errText}` },
          { status: 502 }
        );
      }
    } catch (fetchErr) {
      clearTimeout(timeout);
      const msg = fetchErr instanceof Error && fetchErr.name === 'AbortError'
        ? 'Print server timeout (3s)'
        : 'Print server unreachable';
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Receipt print-server error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
