import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { fetchReceiptConfig } from '@/lib/data/receipt-config';

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

    // Fetch transaction with all details
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select(`
        *,
        customer:customers(first_name, last_name, phone),
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

    // Fetch receipt config (includes printer_ip from receipt_config or legacy star_printer_ip)
    const { merged, printer_ip } = await fetchReceiptConfig(supabase);

    if (!printer_ip) {
      return NextResponse.json(
        { error: 'Printer not configured. Set printer IP in Settings > Receipt Printer.' },
        { status: 400 }
      );
    }

    // Return receipt data + config for client-side Star WebPRNT printing
    return NextResponse.json({
      data: {
        printer_ip,
        transaction,
        receipt_config: merged,
      },
    });
  } catch (err) {
    console.error('Receipt print error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
