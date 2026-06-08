/**
 * GET /api/pos/settings/cancellation-fee-default
 *
 * Phase 3 Theme D.2 (AC-14): POS-auth variant of the same endpoint at
 * `/api/admin/settings/cancellation-fee-default`. The POS cancel dialog
 * authenticates via `X-POS-Session` (HMAC), not session cookies, so it
 * needs a parallel route under `/api/pos/...`.
 *
 * Mirrors the existing `quote-defaults` pattern at
 * `src/app/api/pos/settings/quote-defaults/route.ts`. Reuses the canonical
 * `getDefaultCancellationFeeCents` helper — single source of truth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDefaultCancellationFeeCents } from '@/lib/appointments/cancel-orchestration';

export async function GET(request: NextRequest) {
  const auth = await authenticatePosRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const default_cents = await getDefaultCancellationFeeCents(supabase);
    return NextResponse.json({ default_cents });
  } catch (err) {
    console.error('pos cancellation-fee-default GET error:', err);
    return NextResponse.json({ default_cents: 0 });
  }
}
