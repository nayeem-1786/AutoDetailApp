/**
 * GET /api/admin/settings/cancellation-fee-default
 *
 * Phase 3 Theme D.2 (AC-14): returns the configured default cancellation
 * fee in cents so the admin + POS cancel dialogs can pre-fill their fee
 * input and render the breakdown UI (Paid - Fee = Refund) before the
 * operator confirms.
 *
 * Read-only, lightweight. Reuses the canonical `getDefaultCancellationFeeCents`
 * helper from the cancel orchestrator — single source of truth for the
 * fee-read logic across the orchestrator's safety-net branch AND the dialog
 * pre-fill path. No write side effect here; the operator edits the fee via
 * Admin > Settings > Business Profile (which writes the
 * `cancellation_fee_default_cents` business_settings row directly).
 *
 * Auth: any authenticated employee — no permission check required because
 * (a) the value is non-sensitive (cents of a flat fee), (b) every operator
 * who can open a cancel dialog needs to see the breakdown, and (c) the
 * dedicated `appointments.waive_fee` permission already gates the edit-fee
 * affordance inside the dialog. Surfacing a 403 here would block legit
 * cancel dialog renders for operators who can cancel but cannot edit the
 * fee.
 *
 * Endpoint path lives under `/api/admin/settings/...` because it sources
 * from the admin Business Profile setting; the POS dialog hits the same
 * endpoint via `posFetch` since POS-side employees authenticate as the
 * same `employees` row underneath. No POS-specific variant needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { getDefaultCancellationFeeCents } from '@/lib/appointments/cancel-orchestration';

export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const default_cents = await getDefaultCancellationFeeCents(supabase);

    return NextResponse.json({ default_cents });
  } catch (err) {
    console.error('cancellation-fee-default GET error:', err);
    // Graceful: a read failure shouldn't block the dialog from opening.
    // The orchestrator's own default-read is identically graceful (returns
    // 0 on error); mirror that here so the UI degrades to "no fee" rather
    // than blocking the cancel flow.
    return NextResponse.json({ default_cents: 0 });
  }
}
