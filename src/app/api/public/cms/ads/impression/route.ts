import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// POST /api/public/cms/ads/impression — Record ad impression
// No auth required.
// ---------------------------------------------------------------------------

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

export async function POST(request: Request) {
  const body = await request.json();
  const { ad_creative_id, ad_placement_id, page_path, zone_id } = body as {
    ad_creative_id?: string;
    ad_placement_id?: string;
    page_path?: string;
    zone_id?: string;
  };

  if (!ad_creative_id) {
    return NextResponse.json(
      { error: 'Missing required field: ad_creative_id' },
      { status: 400 }
    );
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const rawIp = forwarded?.split(',')[0]?.trim() ?? '0.0.0.0';
  const ipHash = hashIp(rawIp);

  const admin = createAdminClient();

  // Dedup: check for same ip_hash + creative within the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: existing } = await admin
    .from('ad_events')
    .select('id')
    .eq('ip_hash', ipHash)
    .eq('ad_creative_id', ad_creative_id)
    .eq('event_type', 'impression')
    .gte('created_at', oneHourAgo)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ success: true, deduplicated: true });
  }

  // Insert impression event
  const { error: eventError } = await admin
    .from('ad_events')
    .insert({
      ad_creative_id,
      ad_placement_id: ad_placement_id ?? null,
      event_type: 'impression',
      page_path: page_path ?? null,
      zone_id: zone_id ?? null,
      ip_hash: ipHash,
    });

  if (eventError) {
    console.error('[Ad Impression] Failed to insert event:', eventError.message);
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  // Increment impression_count on the creative
  const { error: rpcError } = await admin.rpc('increment_ad_impression', {
    creative_id: ad_creative_id,
  });

  // Fallback: if RPC doesn't exist, do a manual increment
  if (rpcError) {
    const { data: creative } = await admin
      .from('ad_creatives')
      .select('impression_count')
      .eq('id', ad_creative_id)
      .single();

    if (creative) {
      await admin
        .from('ad_creatives')
        .update({ impression_count: creative.impression_count + 1 })
        .eq('id', ad_creative_id);
    }
  }

  return NextResponse.json({ success: true });
}
