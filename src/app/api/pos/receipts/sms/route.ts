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

    // Fetch transaction with vehicle and access_token for the short SMS
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select(`
        access_token,
        total_amount,
        tip_amount,
        vehicle:vehicles(year, make, model)
      `)
      .eq('id', transaction_id)
      .single();

    if (error || !transaction) {
      throw new Error('Transaction not found');
    }

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
