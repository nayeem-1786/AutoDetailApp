import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET /api/admin/cms/ads/analytics — Ad performance data
// Query params: ?period=7d|30d|90d|all
// ---------------------------------------------------------------------------

function getPeriodDate(period: string): string | null {
  const now = new Date();
  switch (period) {
    case '7d':
      now.setDate(now.getDate() - 7);
      return now.toISOString();
    case '30d':
      now.setDate(now.getDate() - 30);
      return now.toISOString();
    case '90d':
      now.setDate(now.getDate() - 90);
      return now.toISOString();
    case 'all':
    default:
      return null;
  }
}

interface CreativeStats {
  ad_creative_id: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

export async function GET(request: Request) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') ?? '30d';
  const sinceDate = getPeriodDate(period);

  const admin = createAdminClient();

  // Fetch all events within the period
  let query = admin
    .from('ad_events')
    .select('ad_creative_id, event_type');

  if (sinceDate) {
    query = query.gte('created_at', sinceDate);
  }

  const { data: events, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate by creative
  const statsMap = new Map<string, { impressions: number; clicks: number }>();
  let totalImpressions = 0;
  let totalClicks = 0;

  for (const event of events ?? []) {
    const existing = statsMap.get(event.ad_creative_id) ?? { impressions: 0, clicks: 0 };
    if (event.event_type === 'impression') {
      existing.impressions++;
      totalImpressions++;
    } else if (event.event_type === 'click') {
      existing.clicks++;
      totalClicks++;
    }
    statsMap.set(event.ad_creative_id, existing);
  }

  // Build top creatives array sorted by impressions descending
  const creativeIds = Array.from(statsMap.keys());
  const creativeNames: Record<string, string> = {};

  if (creativeIds.length > 0) {
    const { data: creatives } = await admin
      .from('ad_creatives')
      .select('id, name')
      .in('id', creativeIds);

    for (const c of creatives ?? []) {
      creativeNames[c.id] = c.name;
    }
  }

  const topCreatives: (CreativeStats & { name: string })[] = Array.from(statsMap.entries())
    .map(([id, stats]) => ({
      ad_creative_id: id,
      name: creativeNames[id] ?? 'Unknown',
      impressions: stats.impressions,
      clicks: stats.clicks,
      ctr: stats.impressions > 0 ? stats.clicks / stats.impressions : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions);

  const averageCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

  return NextResponse.json({
    data: {
      period,
      total_impressions: totalImpressions,
      total_clicks: totalClicks,
      average_ctr: averageCtr,
      top_creatives: topCreatives,
    },
  });
}
