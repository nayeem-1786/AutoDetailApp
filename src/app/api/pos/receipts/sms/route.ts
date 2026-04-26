import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendSms } from '@/lib/utils/sms';
import { getBusinessInfo } from '@/lib/data/business';
import { createShortLink } from '@/lib/utils/short-link';
import { buildSummaryLine } from '@/lib/sms/composites';

export async function POST(request: NextRequest) {
  try {
    // Accept POS token auth OR admin Supabase session auth
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      const supabaseSession = await createClient();
      const { data: { user } } = await supabaseSession.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { transaction_id, phone } = body;

    if (!transaction_id || !phone) {
      return NextResponse.json(
        { error: 'transaction_id and phone are required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch transaction with vehicle and access_token for the short SMS.
    // Session 2C: added customer_id to support the conditional customer fetch
    // below (loaded into scope for Session 3C's hardcoded → chip-driven
    // migration of receipt_sms).
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select(`
        access_token,
        total_amount,
        tip_amount,
        customer_id,
        vehicle:vehicles(year, make, model)
      `)
      .eq('id', transaction_id)
      .single();

    if (error || !transaction) {
      throw new Error('Transaction not found');
    }

    // Session 2C: conditional customer fetch (handles guest-checkout where
    // transaction.customer_id is null). .maybeSingle() also tolerates the
    // theoretical case where customer_id references a deleted record. Result
    // (customer | null) is loaded into local scope at the SMS callsite below;
    // chip-pass is unchanged in 2C — Session 3C's chip-wiring of receipt_sms
    // will use this customer object and MUST handle the null case (receipts
    // still send for guests, just without customer-personalized chips).
    let customer: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null = null;
    if (transaction.customer_id) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('id, first_name, last_name, email, phone')
        .eq('id', transaction.customer_id)
        .maybeSingle();
      customer = customerData;
    }
    void customer; // Loaded for 3C; unused at this hardcoded callsite today.

    const businessInfo = await getBusinessInfo();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const receiptUrl = `${appUrl}/receipt/${transaction.access_token}`;
    const shortUrl = await createShortLink(receiptUrl);

    // Format total (includes tip)
    const grandTotal = Number(transaction.total_amount) + Number(transaction.tip_amount || 0);
    const total = `$${grandTotal.toFixed(2)}`;

    // Build SMS body — vehicle line or "Your total" (length-aware)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vehicle = transaction.vehicle as any;
    const summaryLine = buildSummaryLine({
      vehicle,
      total,
      businessName: businessInfo.name,
      shortUrl,
    });

    const smsBody = `${businessInfo.name}\n${summaryLine}\nThank you! View receipt:\n${shortUrl}`;

    const result = await sendSms(phone, smsBody, {
      logToConversation: true,
      notificationType: 'receipt_sent',
      contextId: transaction_id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Receipt SMS error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message === 'Transaction not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
