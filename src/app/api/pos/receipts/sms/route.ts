import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendSms } from '@/lib/utils/sms';
import { getBusinessInfo } from '@/lib/data/business';
import { createShortLink } from '@/lib/utils/short-link';
import { buildSummaryLine } from '@/lib/sms/composites';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { normalizePhone } from '@/lib/utils/format';

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

    // Phase Normalization-1: receipt SMS input boxes (POS + admin
    // receipt-dialog) format phone for display while typing. Defense-in-depth
    // alongside the chokepoint in sendSms() — reject 400 here so the operator
    // sees a clear error rather than a generic "SMS failed" message.
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch transaction with vehicle and access_token for the short SMS.
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

    // Conditional customer fetch (handles guest-checkout where transaction.customer_id
    // is null). .maybeSingle() also tolerates the theoretical case where customer_id
    // references a deleted record. Receipts still send for guests, just without the
    // optional customer-personalized chips (first_name / last_name) populated.
    let customer: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null = null;
    if (transaction.customer_id) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('id, first_name, last_name, email, phone')
        .eq('id', transaction.customer_id)
        .maybeSingle();
      customer = customerData;
    }

    const businessInfo = await getBusinessInfo();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const receiptUrl = `${appUrl}/receipt/${transaction.access_token}`;
    const shortUrl = await createShortLink(receiptUrl);

    // Format total (includes tip)
    const grandTotal = Number(transaction.total_amount) + Number(transaction.tip_amount || 0);
    const total = `$${grandTotal.toFixed(2)}`;

    // Build summary_line composite caller-side (length-aware: truncates the
    // vehicle prefix when the assembled body would exceed 160 chars). The
    // budget assumes the default body shape — operators editing the template
    // to add prose may cause segmentation; vehicle prefix truncates first.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vehicle = transaction.vehicle as any;
    const summaryLine = buildSummaryLine({
      vehicle,
      total,
      businessName: businessInfo.name,
      shortUrl,
    });

    // Session 3D: chip-driven render via receipt_sms slug. business_name
    // auto-injected by the engine; summary_line + receipt_link required;
    // first_name / last_name / vehicle_description optional cheap-adds for
    // operators who want to introduce greeting prose via admin edit.
    const fallback = `${businessInfo.name}\n${summaryLine}\nThank you! View receipt:\n${shortUrl}`;
    const rendered = await renderSmsTemplate('receipt_sms', {
      summary_line: summaryLine,
      receipt_link: shortUrl,
      first_name: customer?.first_name || undefined,
      last_name: customer?.last_name || undefined,
      vehicle_description: vehicle ? cleanVehicleDescription(vehicle) : undefined,
    }, fallback);

    if (!rendered.isActive) {
      console.log('[ReceiptSMS] Slug receipt_sms is silenced — skipping send');
      return NextResponse.json({ success: true, skipped: 'template_disabled' });
    }

    const result = await sendSms(normalizedPhone, rendered.body, {
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
