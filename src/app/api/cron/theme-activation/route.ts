import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// GET /api/cron/theme-activation — Auto-activate/deactivate seasonal themes
// Runs every 15 minutes via internal scheduler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // Verify cron API key
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== process.env.CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  let activated = 0;
  let deactivated = 0;

  // Phase 1: Auto-activate themes whose date range has started
  // Only themes with auto_activate=true, not yet active, starts_at <= now, ends_at > now (or null)
  const { data: toActivate } = await supabase
    .from('seasonal_themes')
    .select('id, name')
    .eq('auto_activate', true)
    .eq('is_active', false)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`);

  for (const theme of toActivate ?? []) {
    // Deactivate all other themes first
    await supabase
      .from('seasonal_themes')
      .update({ is_active: false })
      .neq('id', theme.id);

    // Activate this theme
    const { error } = await supabase
      .from('seasonal_themes')
      .update({ is_active: true })
      .eq('id', theme.id);

    if (!error) {
      activated++;
      console.log(`[CRON] Theme auto-activated: ${theme.name}`);
    }
  }

  // Phase 2: Auto-deactivate themes whose date range has ended
  // Active themes with auto_activate=true and ends_at <= now
  const { data: toDeactivate } = await supabase
    .from('seasonal_themes')
    .select('id, name')
    .eq('auto_activate', true)
    .eq('is_active', true)
    .not('ends_at', 'is', null)
    .lte('ends_at', now);

  for (const theme of toDeactivate ?? []) {
    const { error } = await supabase
      .from('seasonal_themes')
      .update({ is_active: false })
      .eq('id', theme.id);

    if (!error) {
      deactivated++;
      console.log(`[CRON] Theme auto-deactivated: ${theme.name}`);
    }
  }

  return NextResponse.json({
    success: true,
    activated,
    deactivated,
    checked_at: now,
  });
}
