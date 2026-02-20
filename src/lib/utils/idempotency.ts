import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Check if an idempotency key has already been processed.
 * Returns the cached NextResponse if found, or null to proceed.
 */
export async function checkIdempotency(
  key: string | null
): Promise<NextResponse | null> {
  if (!key) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from('idempotency_keys')
    .select('response, status_code')
    .eq('key', key)
    .maybeSingle();

  if (data) {
    return NextResponse.json(data.response, { status: data.status_code });
  }

  return null;
}

/**
 * Save an idempotency key after a successful mutation.
 */
export async function saveIdempotency(
  key: string | null,
  response: unknown,
  statusCode: number
): Promise<void> {
  if (!key) return;

  const admin = createAdminClient();
  await admin.from('idempotency_keys').upsert(
    {
      key,
      response: response as Record<string, unknown>,
      status_code: statusCode,
    },
    { onConflict: 'key' }
  );
}

/**
 * Delete idempotency keys older than 24 hours.
 */
export async function cleanupIdempotencyKeys(): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await admin
    .from('idempotency_keys')
    .delete()
    .lt('created_at', cutoff)
    .select('key');

  return data?.length ?? 0;
}
