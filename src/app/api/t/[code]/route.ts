import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Click tracking redirect handler.
 * Public endpoint — no auth required.
 * Records click metadata then 302 redirects to original URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const supabase = createAdminClient();

  // Look up the tracked link by short code
  const { data: trackedLink, error } = await supabase
    .from('tracked_links')
    .select('*')
    .eq('short_code', code)
    .single();

  if (error || !trackedLink) {
    // Unknown code — redirect to homepage
    return NextResponse.redirect(new URL('/', appUrl));
  }

  // Extract request metadata for click tracking
  const forwarded = request.headers.get('x-forwarded-for');
  const ipAddress = forwarded
    ? forwarded.split(',')[0].trim()
    : request.headers.get('x-real-ip') || null;
  const userAgent = request.headers.get('user-agent') || null;

  // Record the click asynchronously (don't block redirect)
  try {
    await supabase.from('link_clicks').insert({
      short_code: trackedLink.short_code,
      original_url: trackedLink.original_url,
      customer_id: trackedLink.customer_id || null,
      campaign_id: trackedLink.campaign_id || null,
      lifecycle_execution_id: trackedLink.lifecycle_execution_id || null,
      source: trackedLink.source,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    // Update campaign_recipients.clicked_at on first click
    if (trackedLink.campaign_id && trackedLink.customer_id) {
      await supabase
        .from('campaign_recipients')
        .update({ clicked_at: new Date().toISOString() })
        .eq('campaign_id', trackedLink.campaign_id)
        .eq('customer_id', trackedLink.customer_id)
        .is('clicked_at', null);
    }
  } catch (clickErr) {
    // Don't block redirect if click logging fails
    console.error('[LinkTracking] Failed to record click:', clickErr);
  }

  return NextResponse.redirect(trackedLink.original_url, 302);
}
