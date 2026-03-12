import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendSms } from '@/lib/utils/sms';
import { getBusinessInfo } from '@/lib/data/business';
import { createShortLink } from '@/lib/utils/short-link';

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

    // Format total
    const total = `$${Number(transaction.total_amount).toFixed(2)}`;

    // Build SMS body — vehicle line or "Your total"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vehicle = transaction.vehicle as any;
    let summaryLine: string;
    if (vehicle?.year || vehicle?.make || vehicle?.model) {
      const vehicleStr = [vehicle.year, vehicle.make, vehicle.model]
        .filter(Boolean)
        .join(' ');
      summaryLine = `${vehicleStr} — ${total}`;
      // If the full message would exceed 160 chars, truncate vehicle info
      const testMsg = `${businessInfo.name}\n${summaryLine}\nThank you! View receipt:\n${shortUrl}`;
      if (testMsg.length > 160) {
        const maxVehicle = 160 - businessInfo.name.length - total.length - shortUrl.length - 30; // account for fixed text
        const truncated = vehicleStr.slice(0, Math.max(10, maxVehicle)) + '...';
        summaryLine = `${truncated} — ${total}`;
      }
    } else {
      summaryLine = `Your total — ${total}`;
    }

    const smsBody = `${businessInfo.name}\n${summaryLine}\nThank you! View receipt:\n${shortUrl}`;

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
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message === 'Transaction not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
