import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Fetch printer IP from business settings
    const { data: printerSetting } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'star_printer_ip')
      .maybeSingle();

    const printerIp = printerSetting?.value as string | null;

    if (!printerIp) {
      return NextResponse.json(
        { error: 'Printer not configured. Set star_printer_ip in business settings.' },
        { status: 400 }
      );
    }

    // Return receipt data for client-side Star WebPRNT printing
    return NextResponse.json({
      data: {
        printer_ip: printerIp,
        transaction,
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
