import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// POST /api/public/cms/ads/click — Record ad click
// No auth required.
// ---------------------------------------------------------------------------

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

  const admin = createAdminClient();

  // Insert click event
  const { error: eventError } = await admin
    .from('ad_events')
    .insert({
      ad_creative_id,
      ad_placement_id: ad_placement_id ?? null,
      event_type: 'click',
      page_path: page_path ?? null,
      zone_id: zone_id ?? null,
      ip_hash: null,
    });

  if (eventError) {
    console.error('[Ad Click] Failed to insert event:', eventError.message);
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  // Increment click_count on the creative
  const { error: rpcError } = await admin.rpc('increment_ad_click', {
    creative_id: ad_creative_id,
  });

  // Fallback: if RPC doesn't exist, do a manual increment
  if (rpcError) {
    const { data: creative } = await admin
      .from('ad_creatives')
      .select('click_count')
      .eq('id', ad_creative_id)
      .single();

    if (creative) {
      await admin
        .from('ad_creatives')
        .update({ click_count: creative.click_count + 1 })
        .eq('id', ad_creative_id);
    }
  }

  return NextResponse.json({ success: true });
}
