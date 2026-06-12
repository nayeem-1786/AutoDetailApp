/**
 * POS operator route — send a payment link for an appointment.
 *
 * Auth: POS session (`authenticatePosRequest` — X-POS-Session header). The
 * operator-trust boundary is established before any delegation.
 *
 * Phase 3 Theme B.2 (2026-06-07): core orchestration extracted to the shared
 * helper `src/lib/payment-link/send.ts`. This route is now a thin auth + body
 * validation + delegate shell. The voice-agent path
 * (`/api/voice-agent/send-payment-link`) wraps the same helper with a
 * different auth scheme (Bearer voice_agent_api_key).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendPaymentLink } from '@/lib/payment-link/send';
import { STRIPE_MIN_AMOUNT_CENTS } from '@/lib/utils/money';
import { getRequestIp } from '@/lib/services/audit';

type Method = 'email' | 'sms' | 'both';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const method = body?.method as Method | undefined;
    if (method !== 'email' && method !== 'sms' && method !== 'both') {
      return NextResponse.json(
        { error: "method must be 'email', 'sms', or 'both'" },
        { status: 400 }
      );
    }

    // amount_cents is optional. Omitted = legacy/full-balance behavior, the
    // column stays NULL on the row. Provided = custom-amount link, validated
    // by the helper against the recomputed remaining (never trusts the
    // client's remaining — staff could be looking at stale UI).
    const rawAmountCents: unknown = body?.amount_cents;
    let amountCents: number | null | undefined = undefined;
    if (rawAmountCents !== undefined && rawAmountCents !== null) {
      if (
        typeof rawAmountCents !== 'number' ||
        !Number.isInteger(rawAmountCents) ||
        rawAmountCents < STRIPE_MIN_AMOUNT_CENTS
      ) {
        return NextResponse.json(
          {
            error: `amount_cents must be an integer >= ${STRIPE_MIN_AMOUNT_CENTS}`,
          },
          { status: 422 }
        );
      }
      amountCents = rawAmountCents;
    }

    // Item 3 (Session #149) — re-send-after-paid confirmation bypass. The
    // operator UI parses the 409 + `code: 'previous_link_paid'` response
    // and re-POSTs with `confirm_resend: true` after the operator clicks
    // "Send anyway" in the confirmation modal. Always boolean-coerce so a
    // truthy-string body value isn't accepted as bypass.
    const confirmResend = body?.confirm_resend === true;

    const admin = createAdminClient();

    const result = await sendPaymentLink({
      admin,
      appointmentId: id,
      method,
      amountCents,
      confirmResend,
      // Item 5 (Session #149) — actor context for the audit_log row.
      // POS path has a fully-identified operator session via
      // authenticatePosRequest. triggeredBy: 'operator' resolves to
      // source: 'pos' inside the helper.
      actor: {
        triggeredBy: 'operator',
        userId: posEmployee.auth_user_id,
        userEmail: posEmployee.email,
        employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`.trim(),
        ipAddress: getRequestIp(request),
      },
    });

    if (!result.success) {
      const errorBody: Record<string, unknown> = { error: result.error };
      if (result.channels) errorBody.channels = result.channels;
      if (result.errors) errorBody.errors = result.errors;
      // Item 3 — bubble the structured 'previous_link_paid' surface to the
      // client verbatim so the dialog can render the confirmation modal
      // with the previous payment context.
      if (result.code) errorBody.code = result.code;
      if (result.previous_payment) errorBody.previous_payment = result.previous_payment;
      return NextResponse.json(errorBody, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      channels: result.channels,
      payment_link_token: result.payment_link_token,
      pay_url: result.pay_url,
      ...(result.partial_errors
        ? { partial_errors: result.partial_errors }
        : {}),
    });
  } catch (err) {
    console.error('[send-payment-link] unexpected error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
