// ──────────────────────────────────────────────────────────────────────────────
// Phase 3 Theme C.2 — customer-accept endpoint thin wrapper.
//
// Per the locked AC-12 architecture, this endpoint owns ONLY the token
// validation (auth boundary). All side effects — status flip, appointment
// creation, customer SMS, staff SLA alert, staff email, audit log — live in
// the `processCustomerAccept` orchestrator at `src/lib/quotes/customer-accept-service.ts`.
//
// The pre-Theme-C.2 handler (227 lines) inlined every side effect; the refactor
// preserves byte-stable behavior for customer SMS + staff email and REPLACES
// the prior `quote_accepted_staff_notify` inline staff SMS with the new
// `pending_appointment_sla_alert` template (per G.7 / C.1 seed). The new
// template reflects the new auto-conversion semantics ("appointment created,
// awaiting confirmation") and is gated by business hours per the locked
// 8am–8pm immediate / queue-overnight pattern.
//
// Race-loss path: on `already_converted=true` (Theme F's F.7 idempotency
// guard) the response stays 200 + the existing appointment_id; the orchestrator
// suppresses duplicate notifications.
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processCustomerAccept } from '@/lib/quotes/customer-accept-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { access_token } = body;

    if (!access_token || typeof access_token !== 'string') {
      return NextResponse.json({ error: 'access_token is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Token validation — the only auth check this endpoint owns. The
    // orchestrator assumes the caller has verified the customer owns the
    // access token; never bypass this guard for any caller.
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('quotes')
      .select('id, access_token, status')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (tokenErr || !tokenRow) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }
    if (tokenRow.access_token !== access_token) {
      return NextResponse.json({ error: 'Invalid access token' }, { status: 403 });
    }

    const result = await processCustomerAccept(supabase, { quoteId: id });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // On the F.7 race-loss path the existing accept-time response is the
    // honest one; the caller still gets a 200 with the existing appointment_id.
    return NextResponse.json({
      success: true,
      appointment_id: result.appointment_id,
      already_converted: result.already_converted,
    });
  } catch (err) {
    console.error('Quote accept error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
