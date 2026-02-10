import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, getPeriodDates } from '@/lib/utils/analytics-helpers';
import { getVariantStats } from '@/lib/campaigns/ab-testing';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin();
    if ('error' in auth) return auth.error;
    const { adminClient } = auth;

    const period = request.nextUrl.searchParams.get('period') || '30d';
    const { start, end } = getPeriodDates(period);

    // Find campaigns that have A/B variants and were sent in the period
    const { data: variants } = await adminClient
      .from('campaign_variants')
      .select('campaign_id')
      .gte('created_at', start)
      .lte('created_at', end);

    if (!variants || variants.length === 0) {
      return NextResponse.json({ tests: [] });
    }

    // Get unique campaign IDs that have variants
    const campaignIds = [...new Set(variants.map((v: { campaign_id: string }) => v.campaign_id))];

    // Get campaign details
    const { data: campaigns } = await adminClient
      .from('campaigns')
      .select('id, name, channel, sent_at, status')
      .in('id', campaignIds)
      .order('sent_at', { ascending: false });

    const tests = [];

    for (const campaign of campaigns ?? []) {
      const variantStats = await getVariantStats(campaign.id);

      if (variantStats.length > 0) {
        tests.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          channel: campaign.channel,
          sentAt: campaign.sent_at,
          status: campaign.status,
          variants: variantStats,
        });
      }
    }

    return NextResponse.json({ tests });
  } catch (err) {
    console.error('Marketing A/B test analytics GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
