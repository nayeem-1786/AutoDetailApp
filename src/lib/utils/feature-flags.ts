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
 */
export async function setFeatureFlag(key: string, enabled: boolean): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('feature_flags')
    .update({ enabled })
    .eq('key', key);
}
