import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Check if a feature flag is enabled (server-side).
 * Uses service-role client — safe for API routes, cron jobs, webhooks.
 * Returns false if flag doesn't exist or query fails (fail-closed).
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('feature_flags')
    .select('enabled')
    .eq('key', key)
    .single();

  return data?.enabled === true;
}

/**
 * Set a feature flag to enabled or disabled.
 * Used by CMS routes to auto-enable/disable flags when content is activated.
 * Uses update + fallback insert to handle both existing and missing rows.
 */
export async function setFeatureFlag(key: string, enabled: boolean): Promise<void> {
  const supabase = createAdminClient();

  // Try update first (common path — flag row exists from migration seed)
  const { data } = await supabase
    .from('feature_flags')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('key', key)
    .select('id');

  // If no row was updated, the flag doesn't exist — create it
  if (!data || data.length === 0) {
    await supabase
      .from('feature_flags')
      .insert({
        key,
        name: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        description: `Auto-created flag for ${key}`,
        category: 'Website',
        enabled,
      });
  }
}
