import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { generateReceiptLines, receiptToEscPos } from '@/app/pos/lib/receipt-template';
import { fetchReceiptData } from '@/lib/data/receipt-data';

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      const supabaseSession = await createClient();
      const { data: { user } } = await supabaseSession.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { transaction_id } = body;

    if (!transaction_id) {
      return NextResponse.json(
        { error: 'transaction_id is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { tx, config, context, print_server_url } = await fetchReceiptData(supabase, transaction_id);

    if (!print_server_url) {
      console.error('print_server_url is null — receipt_config may not have been saved with this field yet');
      return NextResponse.json(
        { error: 'Print server not configured. Set Print Server URL in Settings > Receipt Printer.' },
        { status: 400 }
      );
    }

    const receiptLines = generateReceiptLines(tx, config, context);
    const escPosData = receiptToEscPos(receiptLines, 48);

    // Send binary data to local print server with 3-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const printRes = await fetch(`${print_server_url}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: escPosData,
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
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message === 'Transaction not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
