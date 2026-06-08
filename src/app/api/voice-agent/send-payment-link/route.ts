/**
 * Voice-agent route — send a payment link for an appointment.
 *
 * Auth: Bearer voice_agent_api_key (`validateApiKey`). Used by the SMS AI v2
 * dispatcher (`tool-dispatcher.ts → callSendPaymentLink`) AND, when wired
 * upstream, the ElevenLabs Phone agent Tom.
 *
 * Phase 3 Theme B.2 (2026-06-07, AC-11 completion): this is the 14th
 * voice-agent tool — `send_payment_link`. It wraps the shared helper
 * `src/lib/payment-link/send.ts` with Bearer-token auth, mirroring the way
 * `/api/pos/appointments/[id]/send-payment-link` (POS session auth) does
 * the same for the operator surface.
 *
 * Defaults differ from the POS route's UX:
 *   - `channels` defaults to `['sms', 'email']` (full multi-channel) when
 *     omitted, mirroring the audit F.2 "agent always sends full multi-channel"
 *     default. The agent's tool description guides the LLM to pass an
 *     explicit `channels` array when the customer asked for a specific
 *     channel (e.g., "text me the link, don't email").
 *   - `amount_cents` is optional — when omitted, the helper falls back to
 *     full remaining balance, same legacy semantic the POS route carried
 *     before extraction. The voice agent typically omits it and lets the
 *     server compute remaining, since the agent has no canonical view of
 *     `appointments.payment_status` at tool-call time.
 *
 * Channel translation: the agent's tool input uses `channels: string[]`
 * (`['sms']` / `['email']` / `['sms', 'email']`) for natural-language
 * friendliness; the helper's underlying `method: 'sms' | 'email' | 'both'`
 * is computed here. Anything outside the three valid combinations returns
 * 400 — defends against LLM-hallucinated channel names ("twilio", "voice",
 * etc.).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';
import {
  sendPaymentLink,
  type PaymentLinkMethod,
} from '@/lib/payment-link/send';
import { STRIPE_MIN_AMOUNT_CENTS } from '@/lib/utils/money';

type Channel = 'sms' | 'email';
const VALID_CHANNELS: readonly Channel[] = ['sms', 'email'] as const;

function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && (VALID_CHANNELS as readonly string[]).includes(value);
}

function channelsToMethod(channels: Channel[]): PaymentLinkMethod | null {
  const wantsSms = channels.includes('sms');
  const wantsEmail = channels.includes('email');
  if (wantsSms && wantsEmail) return 'both';
  if (wantsSms) return 'sms';
  if (wantsEmail) return 'email';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      appointment_id,
      amount_cents: rawAmountCents,
      channels: rawChannels,
    } = body as {
      appointment_id?: string;
      amount_cents?: unknown;
      channels?: unknown;
    };

    if (typeof appointment_id !== 'string' || !appointment_id.trim()) {
      return NextResponse.json(
        { error: 'appointment_id is required' },
        { status: 400 }
      );
    }

    // amount_cents: optional. When omitted the helper falls back to full
    // remaining balance. When provided, must be an integer >= STRIPE_MIN.
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

    // channels: optional. Defaults to ['sms', 'email'] = both. The agent
    // SHOULD pass an explicit array when the customer asked for a specific
    // channel; an empty / unrecognized array is treated as an error so
    // the LLM gets a clear instruction to retry rather than silently
    // dispatching to nothing.
    let channels: Channel[];
    if (rawChannels === undefined || rawChannels === null) {
      channels = ['sms', 'email'];
    } else if (!Array.isArray(rawChannels)) {
      return NextResponse.json(
        { error: 'channels must be an array of "sms" and/or "email"' },
        { status: 400 }
      );
    } else {
      const filtered = rawChannels.filter(isChannel);
      if (filtered.length === 0) {
        return NextResponse.json(
          {
            error:
              'channels must include at least one of "sms" or "email"',
          },
          { status: 400 }
        );
      }
      // Dedupe while preserving order
      channels = Array.from(new Set(filtered));
    }

    const method = channelsToMethod(channels);
    if (!method) {
      // Defensive — channelsToMethod returns null only when both sms+email
      // are absent, which the filter above already rejects. Belt + suspenders.
      return NextResponse.json(
        { error: 'channels resolved to an empty selection' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const result = await sendPaymentLink({
      admin,
      appointmentId: appointment_id,
      method,
      amountCents,
    });

    if (!result.success) {
      const errorBody: Record<string, unknown> = { error: result.error };
      if (result.channels) errorBody.channels = result.channels;
      if (result.errors) errorBody.errors = result.errors;
      return NextResponse.json(errorBody, { status: result.status });
    }

    // Surface channel results back to the LLM verbatim so it can
    // factually report "sent via SMS" vs "sent via email" without
    // hallucination. `channels_dispatched` is the LLM-friendly summary
    // — the array of channels that achieved 'sent' status.
    const channelsDispatched: Channel[] = [];
    if (result.channels.sms === 'sent') channelsDispatched.push('sms');
    if (result.channels.email === 'sent') channelsDispatched.push('email');

    return NextResponse.json({
      success: true,
      payment_link_url: result.pay_url,
      payment_link_token: result.payment_link_token,
      channels: result.channels,
      channels_dispatched: channelsDispatched,
      ...(result.partial_errors
        ? { partial_errors: result.partial_errors }
        : {}),
    });
  } catch (err) {
    console.error('[voice-agent/send-payment-link] unexpected error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
