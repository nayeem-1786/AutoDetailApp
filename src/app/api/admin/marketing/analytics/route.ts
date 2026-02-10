import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, getPeriodDates } from '@/lib/utils/analytics-helpers';
import { getAttributedRevenueForPeriod } from '@/lib/utils/attribution';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin();
    if ('error' in auth) return auth.error;
    const { adminClient } = auth;

    const period = request.nextUrl.searchParams.get('period') || '30d';
    const { start, end } = getPeriodDates(period);

    // SMS metrics from sms_delivery_log
    const { count: totalSmsSent } = await adminClient
      .from('sms_delivery_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start)
      .lte('created_at', end);

    const { count: smsDelivered } = await adminClient
      .from('sms_delivery_log')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'delivered')
      .gte('created_at', start)
      .lte('created_at', end);

    // Email metrics from email_delivery_log
    const { count: totalEmailSent } = await adminClient
      .from('email_delivery_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start)
      .lte('created_at', end);

    const { count: emailDelivered } = await adminClient
      .from('email_delivery_log')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'delivered')
      .gte('created_at', start)
      .lte('created_at', end);

    // Click rates from email_delivery_log (clicked events)
    const { count: emailClicks } = await adminClient
      .from('email_delivery_log')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'clicked')
      .gte('created_at', start)
      .lte('created_at', end);

    // Opt-out rate from sms_consent_log
    const { count: optOuts } = await adminClient
      .from('sms_consent_log')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'opt_out')
      .gte('created_at', start)
      .lte('created_at', end);

    // Total contactable customers (sms_consent = true)
    const { count: totalContactable } = await adminClient
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('sms_consent', true);

    // Attributed revenue
    const attribution = await getAttributedRevenueForPeriod(start, end);

    const smsSent = totalSmsSent ?? 0;
    const emailSent = totalEmailSent ?? 0;
    const smsDeliv = smsDelivered ?? 0;
    const emailDeliv = emailDelivered ?? 0;

    return NextResponse.json({
      totalSent: { sms: smsSent, email: emailSent },
      deliveryRate: {
        sms: smsSent > 0 ? Math.round((smsDeliv / smsSent) * 10000) / 100 : 0,
        email: emailSent > 0 ? Math.round((emailDeliv / emailSent) * 10000) / 100 : 0,
      },
      clickRate: {
        sms: 0, // SMS click tracking not currently implemented (no link tracking in SMS)
        email: emailDeliv > 0 ? Math.round(((emailClicks ?? 0) / emailDeliv) * 10000) / 100 : 0,
      },
      optOutRate: (totalContactable ?? 0) > 0
        ? Math.round(((optOuts ?? 0) / (totalContactable ?? 1)) * 10000) / 100
        : 0,
      attributedRevenue: attribution.totalRevenue,
      period,
    });
  } catch (err) {
    console.error('Marketing analytics overview GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
