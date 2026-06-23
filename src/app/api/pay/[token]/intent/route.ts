import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { toCents, STRIPE_MIN_AMOUNT_CENTS } from '@/lib/utils/money';
import { computeBalanceDue } from '@/lib/data/transaction-totals';
import { getBusinessInfo } from '@/lib/data/business';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  // Item 2 (2026-06-20) — tip in payment link, full-payment links only.
  // Body is optional: GET-style flows (legacy clients pre-Item-2) send no
  // body and get tip=0 transparently. Body shape is JSON `{ tipCents:
  // number }` — anything else is rejected with 422. Tip applicability
  // (full vs partial link) is re-checked server-side BELOW after the
  // appointment row is loaded — this is defense-in-depth on top of the
  // client-side gate at `pay-form.tsx`.
  let requestedTipCents = 0;
  try {
    const raw = await request.text();
    if (raw.trim().length > 0) {
      const parsed = JSON.parse(raw) as { tipCents?: unknown };
      if (parsed.tipCents !== undefined) {
        if (
          typeof parsed.tipCents !== 'number' ||
          !Number.isInteger(parsed.tipCents) ||
          parsed.tipCents < 0
        ) {
          return NextResponse.json(
            { error: 'tipCents must be a non-negative integer' },
            { status: 422 }
          );
        }
        requestedTipCents = parsed.tipCents;
      }
    }
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();

    const { data: appt, error: apptErr } = await admin
      .from('appointments')
      .select('id, status, total_amount, payment_status, payment_link_amount_cents')
      .eq('payment_link_token', token)
      .maybeSingle();

    if (apptErr) {
      console.error('[pay-link/intent] appointment lookup failed', {
        token,
        error: apptErr.message,
      });
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }

    if (!appt) {
      return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
    }

    if (appt.status === 'cancelled' || appt.status === 'no_show') {
      return NextResponse.json(
        { error: 'Appointment is no longer payable', reason: appt.status },
        { status: 409 }
      );
    }

    // Remaining balance (cents): total minus sum of payments already on this
    // appointment (joined through transactions). Mirror the webhook's math so
    // both sides agree on what's owed.
    const totalCents = toCents(Number(appt.total_amount));

    const { data: txs, error: txsErr } = await admin
      .from('transactions')
      .select('id')
      .eq('appointment_id', appt.id);
    if (txsErr) {
      throw new Error(`existing-transactions lookup failed: ${txsErr.message}`);
    }

    const txIds = (txs ?? []).map((t) => t.id);
    let paidCents = 0;
    if (txIds.length > 0) {
      const { data: pays, error: paysErr } = await admin
        .from('payments')
        .select('amount')
        .in('transaction_id', txIds);
      if (paysErr) {
        throw new Error(`existing-payments lookup failed: ${paysErr.message}`);
      }
      paidCents = (pays ?? []).reduce(
        (sum, p) => sum + toCents(Number(p.amount)),
        0
      );
    }

    const remainingCents = computeBalanceDue({
      appointmentTotalCents: totalCents,
      totalPaidCents: paidCents,
    });

    if (remainingCents <= 0) {
      return NextResponse.json({ alreadyPaid: true });
    }

    // Custom-amount link (Pay-Link Session 5): if the appointment row has a
    // chosen amount, charge that. Clamp to remaining defensively in case the
    // remaining shrunk between send and pay (extra in-store payment after
    // link was issued). NULL = legacy "full remaining" behavior.
    const customAmountCents = appt.payment_link_amount_cents;
    const chargeCents =
      typeof customAmountCents === 'number'
        ? Math.min(customAmountCents, remainingCents)
        : remainingCents;

    if (chargeCents < STRIPE_MIN_AMOUNT_CENTS) {
      return NextResponse.json(
        { error: `Amount due ($${(chargeCents / 100).toFixed(2)}) is below the online payment minimum.` },
        { status: 400 }
      );
    }

    // Item 2 — server-side full-payment gate. A "full-payment" link is one
    // where this URL is collecting the entire remaining balance: either
    // `payment_link_amount_cents IS NULL` (operator chose "full remaining")
    // OR the stored amount equals/exceeds remaining (e.g., remaining
    // shrunk in-store after the link was issued — the link is now
    // effectively full-pay). Customer-facing pay-form gates the tip UI by
    // the same rule; this enforces it server-side as defense-in-depth.
    //
    // Cents-exact comparison. No tolerance window — both sides are
    // already integer cents.
    const isFullPaymentLink =
      customAmountCents == null || customAmountCents >= remainingCents;

    if (requestedTipCents > 0 && !isFullPaymentLink) {
      return NextResponse.json(
        { error: 'Tips are not accepted on partial-payment links.' },
        { status: 422 }
      );
    }

    // Sanity ceiling: tip ≤ 100% of charge amount. Catches Custom-input
    // fat-finger entries on the client (e.g., $9999 on a $50 charge).
    // Tactical S0 bound; revisit if real-world data shows operator tips
    // > 100% are a legitimate flow.
    if (requestedTipCents > chargeCents) {
      return NextResponse.json(
        {
          error: `Tip ($${(requestedTipCents / 100).toFixed(2)}) cannot exceed the charge amount ($${(chargeCents / 100).toFixed(2)}).`,
        },
        { status: 422 }
      );
    }

    const tipCents = requestedTipCents;
    const piAmountCents = chargeCents + tipCents;

    const businessInfo = await getBusinessInfo();

    // Item 2 — `metadata.tip_cents` is the contract with the webhook
    // (`src/app/api/webhooks/stripe/route.ts`): if set, the webhook
    // subtracts it from `amount_received` to derive subtotal and writes
    // it to `transactions.tip_amount` + `payments.tip_amount`. Stripe
    // metadata values are strings; we serialize the integer and the
    // webhook parses with Number().
    //
    // Only include `tip_cents` in metadata when > 0 to keep no-tip PIs
    // visually clean in the Stripe Dashboard.
    const metadata: Record<string, string> = {
      type: 'appointment_payment_link',
      appointment_id: appt.id,
      payment_link_token: token,
    };
    if (tipCents > 0) {
      metadata.tip_cents = String(tipCents);
    }

    const pi = await stripe.paymentIntents.create({
      amount: piAmountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata,
      description: `${businessInfo.name} — Appointment ${appt.id.slice(0, 8)}`,
    });

    return NextResponse.json({
      clientSecret: pi.client_secret,
      amountCents: chargeCents,
      tipCents,
      totalCents: piAmountCents,
      alreadyPaid: false,
    });
  } catch (err) {
    console.error('[pay-link/intent] PI creation failed', {
      token,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}
