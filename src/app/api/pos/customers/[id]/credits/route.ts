/**
 * GET /api/pos/customers/[id]/credits
 *
 * Phase 3 Theme E.3 follow-up — POS-auth variant of the admin endpoint at
 * `/api/admin/customers/[id]/credits` (GET only — read-only balance for the
 * POS CustomerCreditBadge + ApplyCreditDialog).
 *
 * Closes the cross-surface auth-shape bug introduced by Theme E.3 (commit
 * 6c2f171a): the POS callers were fetching the admin endpoint via `posFetch`,
 * which sends the `X-POS-Session` HMAC header. The admin endpoint uses
 * `getEmployeeFromSession`, which checks the admin Supabase session cookie —
 * POS callers don't have one. The admin endpoint returned 401, `posFetch`
 * cleared `pos_session` localStorage and redirected to
 * `/pos/login?reason=session_expired`, trapping the operator in a login loop
 * on every JobDetail mount.
 *
 * Architectural seam: parallel-route pattern matching the D.2 precedent at
 * `src/app/api/pos/settings/cancellation-fee-default/route.ts` (parallel to
 * the admin route at `src/app/api/admin/settings/cancellation-fee-default/
 * route.ts`). Both routes delegate to the same canonical repository helper —
 * single source of truth. Admin endpoint stays unchanged; the POS endpoint is
 * the new addition.
 *
 * Auth: any authenticated POS employee — NO permission check. Matches D.2's
 * rationale: (a) the value is non-sensitive (cents balance, no PII, no card
 * data), (b) every operator with job-detail access needs the badge for
 * workflow signal, (c) credit ISSUANCE is gated on `customers.adjust_loyalty`
 * via the admin POST handler at `/api/admin/customers/[id]/credits` —
 * view-only does not need a separate gate.
 *
 * Discipline: returns 401 ONLY when `authenticatePosRequest` itself fails (no
 * HMAC, expired token, IP-whitelist block). NEVER conflates permission
 * failure with auth failure — that conflation is what created the loop bug
 * class. If future trust-model changes warrant a permission gate, the
 * canonical pattern is to add `checkPosPermission` + return 403 (NOT 401) on
 * rejection; `posFetch` does not redirect on 403, so the badge fails closed
 * silently via its `if (!res.ok) return;` guard.
 *
 * No POST: credit issuance stays on the admin surface (operator-only via
 * admin > Customer > Credits tab). The POS surface is read-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCustomerCreditBalance } from '@/lib/credits/repository';
import type { CustomerCreditBalance } from '@/lib/credits/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticatePosRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const supabase = createAdminClient();
    const balance = await getCustomerCreditBalance(supabase, id);
    return NextResponse.json(balance);
  } catch (err) {
    console.error('[pos credits GET] error:', err);
    // Graceful: a read failure shouldn't trap the badge/dialog. Mirrors D.2's
    // pattern at /api/pos/settings/cancellation-fee-default (returns the safe
    // zero-state rather than a 5xx that would surface as a user-visible toast
    // or, worse, block the dialog from opening). The badge auto-hides on
    // available_balance_cents === 0 (`customer-credit-badge.tsx:44`); the
    // dialog falls through to "no balance available" non-disruptively.
    const emptyBalance: CustomerCreditBalance = {
      customer_id: id,
      total_issued_cents: 0,
      total_applied_cents: 0,
      available_balance_cents: 0,
      unapplied_credits: [],
    };
    return NextResponse.json(emptyBalance);
  }
}
