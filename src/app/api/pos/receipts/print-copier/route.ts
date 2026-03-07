import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { generateReceiptHtml } from '@/app/pos/lib/receipt-template';
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
    const { tx, config, images, print_server_url } = await fetchReceiptData(supabase, transaction_id);

    if (!print_server_url) {
      return NextResponse.json(
        { error: 'Print server not configured. Set Print Server URL in Settings > Receipt Printer.' },
        { status: 400 }
      );
    }

    const html = generateReceiptHtml(tx, config, images);

    // Copier-specific: remove gray background (was causing extreme shrink),
    // clean black border, standard letter page size.
    let copierHtml = html
      .replace('background:#f5f5f5', 'background:none')
      .replace('border:1px solid #ddd', 'border:1px solid #000');
    copierHtml = copierHtml.replace('<head>', '<head><style>@page{size:letter;margin:0.25in;}body{background:none !important;padding:0 !important;}.receipt-wrap{border:1px solid #000 !important;}</style>');

    // Send HTML to print server for PDF conversion + copier print (15s timeout)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const printRes = await fetch(`${print_server_url}/print-copier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: copierHtml }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!printRes.ok) {
        const errText = await printRes.text().catch(() => 'Unknown error');
        return NextResponse.json(
          { error: `Copier print error: ${errText}` },
          { status: 502 }
        );
      }
    } catch (fetchErr) {
      clearTimeout(timeout);
      const msg = fetchErr instanceof Error && fetchErr.name === 'AbortError'
        ? 'Copier print timeout (15s)'
        : 'Print server unreachable';
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Receipt print-copier error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message === 'Transaction not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
