import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendSms } from '@/lib/utils/sms';
import { generateReceiptLines, receiptToPlainText } from '@/app/pos/lib/receipt-template';
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
    const { transaction_id, phone } = body;

    if (!transaction_id || !phone) {
      return NextResponse.json(
        { error: 'transaction_id and phone are required' },
        { status: 400 }
      );
    }

    // Fetch transaction with full relations for formatted receipt
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

    // Fetch dynamic receipt config
    const { merged } = await fetchReceiptConfig(supabase);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = transaction as any;
    const receiptLines = generateReceiptLines({
      receipt_number: tx.receipt_number,
      transaction_date: tx.transaction_date,
      subtotal: tx.subtotal,
      tax_amount: tx.tax_amount,
      discount_amount: tx.discount_amount,
      tip_amount: tx.tip_amount,
      total_amount: tx.total_amount,
      customer: tx.customer,
      employee: tx.employee,
      vehicle: tx.vehicle,
      items: tx.items ?? [],
      payments: tx.payments ?? [],
    }, merged);
    const smsBody = receiptToPlainText(receiptLines, 40);

    const result = await sendSms(phone, smsBody);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Receipt SMS error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
