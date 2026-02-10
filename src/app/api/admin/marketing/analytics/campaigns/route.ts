import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, getPeriodDates } from '@/lib/utils/analytics-helpers';
import { getAttributedRevenue } from '@/lib/utils/attribution';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin();
    if ('error' in auth) return auth.error;
    const { adminClient } = auth;

    const period = request.nextUrl.searchParams.get('period') || '30d';
    const { start, end } = getPeriodDates(period);

    // Get campaigns sent in period
    const { data: campaigns } = await adminClient
      .from('campaigns')
      .select('id, name, channel, sent_at, recipient_count, delivered_count')
      .eq('status', 'sent')
      .gte('sent_at', start)
      .lte('sent_at', end)
      .order('sent_at', { ascending: false });

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ campaigns: [] });
    }

    const results = [];

    for (const campaign of campaigns) {
      // Check if campaign has A/B variants
      const { count: variantCount } = await adminClient
        .from('campaign_variants')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id);

      // Get SMS delivery stats
      const { count: smsDelivered } = await adminClient
        .from('sms_delivery_log')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('status', 'delivered');

      // Get email delivery stats
      const { count: emailDelivered } = await adminClient
        .from('email_delivery_log')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('event', 'delivered');

      // Get email clicks
      const { count: emailClicked } = await adminClient
        .from('email_delivery_log')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('event', 'clicked');

      // Get opt-outs from recipients of this campaign
      const { data: recipientCustomers } = await adminClient
        .from('campaign_recipients')
        .select('customer_id')
        .eq('campaign_id', campaign.id);

      let optedOut = 0;
      if (recipientCustomers && recipientCustomers.length > 0 && campaign.sent_at) {
        const customerIds = recipientCustomers.map((r: { customer_id: string }) => r.customer_id);
        const { count: optOutCount } = await adminClient
          .from('sms_consent_log')
          .select('id', { count: 'exact', head: true })
          .in('customer_id', customerIds)
          .eq('action', 'opt_out')
          .gte('created_at', campaign.sent_at);

        optedOut = optOutCount ?? 0;
      }

      // Attribution
      let conversions = 0;
      let revenue = 0;
      if (campaign.sent_at) {
        const attrEnd = new Date(
          new Date(campaign.sent_at).getTime() + 30 * 24 * 60 * 60 * 1000
        ).toISOString();

        const attribution = await getAttributedRevenue({
          campaignId: campaign.id,
          periodStart: campaign.sent_at,
          periodEnd: attrEnd,
          windowDays: 7,
        });

        conversions = attribution.uniqueCustomers;
        revenue = attribution.totalRevenue;
      }

      results.push({
        id: campaign.id,
        name: campaign.name,
        channel: campaign.channel,
        sentAt: campaign.sent_at,
        recipients: campaign.recipient_count,
        delivered: (smsDelivered ?? 0) + (emailDelivered ?? 0),
        clicked: emailClicked ?? 0,
        optedOut,
        conversions,
        revenue,
        hasVariants: (variantCount ?? 0) > 0,
      });
    }

    return NextResponse.json({ campaigns: results });
  } catch (err) {
    console.error('Marketing campaign analytics GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
