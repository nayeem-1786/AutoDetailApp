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
 * Uses upsert for reliability — handles both existing and missing rows.
 */
export async function setFeatureFlag(key: string, enabled: boolean): Promise<void> {
  const supabase = createAdminClient();

  // Check if the flag exists first
  const { data: existing } = await supabase
    .from('feature_flags')
    .select('id')
    .eq('key', key)
    .maybeSingle();

  if (existing) {
    // Flag exists — update it
    await supabase
      .from('feature_flags')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('key', key);
  } else {
    // Flag doesn't exist — create it
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
