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
