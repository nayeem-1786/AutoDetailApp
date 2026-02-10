import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, getPeriodDates } from '@/lib/utils/analytics-helpers';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin();
    if ('error' in auth) return auth.error;
    const { adminClient } = auth;

    const period = request.nextUrl.searchParams.get('period') || '30d';
    const { start, end } = getPeriodDates(period);

    // Get all customers with consent status
    const { data: customers } = await adminClient
      .from('customers')
      .select('id, phone, email, sms_consent, email_consent, created_at')
      .limit(50000);

    const all = customers ?? [];

    // Contactable breakdown
    const smsContactable = all.filter(c => c.sms_consent && c.phone);
    const emailContactable = all.filter(c => c.email_consent && c.email);
    const bothContactable = all.filter(c => c.sms_consent && c.phone && c.email_consent && c.email);
    const smsOnly = smsContactable.length - bothContactable.length;
    const emailOnly = emailContactable.length - bothContactable.length;
    const totalContactable = smsOnly + emailOnly + bothContactable.length;

    // Opt-out trend: daily opt-outs in period
    const { data: optOuts } = await adminClient
      .from('sms_consent_log')
      .select('action, created_at')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at');

    // Group opt-outs by date
    const optOutByDate = new Map<string, number>();
    (optOuts ?? []).forEach((entry: { action: string; created_at: string }) => {
      if (entry.action === 'opt_out') {
        const date = entry.created_at.split('T')[0];
        optOutByDate.set(date, (optOutByDate.get(date) ?? 0) + 1);
      }
    });

    const optOutTrend = [...optOutByDate.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Growth trend: new customers per day in period
    const growthByDate = new Map<string, number>();
    all.forEach(c => {
      if (c.created_at >= start && c.created_at <= end) {
        const date = c.created_at.split('T')[0];
        growthByDate.set(date, (growthByDate.get(date) ?? 0) + 1);
      }
    });

    const growthTrend = [...growthByDate.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Delivery health: bounce rates from delivery logs
    const { count: totalSms } = await adminClient
      .from('sms_delivery_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start)
      .lte('created_at', end);

    const { count: smsFailed } = await adminClient
      .from('sms_delivery_log')
      .select('id', { count: 'exact', head: true })
      .in('status', ['failed', 'undelivered'])
      .gte('created_at', start)
      .lte('created_at', end);

    const { count: totalEmail } = await adminClient
      .from('email_delivery_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start)
      .lte('created_at', end);

    const { count: emailBounced } = await adminClient
      .from('email_delivery_log')
      .select('id', { count: 'exact', head: true })
      .in('event', ['bounced', 'failed'])
      .gte('created_at', start)
      .lte('created_at', end);

    // Landline count: customers with phone but not sms-capable
    // We approximate by counting customers with phone but no sms_consent and no SMS history
    const { count: landlineCount } = await adminClient
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .not('phone', 'is', null)
      .eq('sms_consent', false);

    const smsTotal = totalSms ?? 0;
    const emailTotal = totalEmail ?? 0;

    return NextResponse.json({
      totalContactable,
      smsOnly,
      emailOnly,
      both: bothContactable.length,
      optOutTrend,
      growthTrend,
      deliveryHealth: {
        smsBounceRate: smsTotal > 0
          ? Math.round(((smsFailed ?? 0) / smsTotal) * 10000) / 100
          : 0,
        emailBounceRate: emailTotal > 0
          ? Math.round(((emailBounced ?? 0) / emailTotal) * 10000) / 100
          : 0,
        landlineCount: landlineCount ?? 0,
      },
    });
  } catch (err) {
    console.error('Marketing audience analytics GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
