import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { generateReceiptHtml, fetchLogoAsBase64 } from '@/app/pos/lib/receipt-template';
import { fetchReceiptData } from '@/lib/data/receipt-data';

/**
 * GET /api/pos/receipts/html?transaction_id=...
 * Returns the fully rendered receipt HTML as text/html.
 * Used by the POS Print button to open in a popup for native browser printing.
 * Also used by Admin ReceiptDialog and Customer Portal for consistent rendering.
 */
export async function GET(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      const supabaseSession = await createClient();
      const { data: { user } } = await supabaseSession.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const transactionId = request.nextUrl.searchParams.get('transaction_id');
    if (!transactionId) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { tx, config, images } = await fetchReceiptData(supabase, transactionId);
    // Inline logo as base64 for print/AirPrint (no external network dependency)
    if (config.logo_url) {
      images.logoBase64 = await fetchLogoAsBase64(config.logo_url) ?? undefined;
    }
    const html = generateReceiptHtml(tx, config, images);

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('Receipt HTML error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message === 'Transaction not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
