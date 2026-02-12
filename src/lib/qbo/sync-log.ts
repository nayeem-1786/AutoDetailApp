import { createAdminClient } from '@/lib/supabase/admin';
import type { QboSyncLogEntry } from './types';

/** Insert a sync log entry. Source defaults to 'manual' if not provided. */
export async function logSync(
  entry: Omit<QboSyncLogEntry, 'id' | 'created_at'>
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('qbo_sync_log').insert({
    ...entry,
    source: entry.source || 'manual',
  });
}

/** Read sync log with pagination (newest first). */
export async function getSyncLog(
  limit = 50,
  offset = 0
): Promise<QboSyncLogEntry[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('qbo_sync_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  return (data as QboSyncLogEntry[]) || [];
}

/** Clear all sync log entries. */
export async function clearSyncLog(): Promise<void> {
  const supabase = createAdminClient();
  // Delete all rows — no WHERE needed but PostgREST requires a filter
  await supabase.from('qbo_sync_log').delete().gte('created_at', '1970-01-01');
}
