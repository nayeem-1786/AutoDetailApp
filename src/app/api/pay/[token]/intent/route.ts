import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { toCents } from '@/lib/utils/refund-math';
import { STRIPE_MIN_AMOUNT_CENTS } from '@/lib/utils/money';
import { getBusinessInfo } from '@/lib/data/business';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
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

    const remainingCents = Math.max(0, totalCents - paidCents);

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

    const businessInfo = await getBusinessInfo();

    const pi = await stripe.paymentIntents.create({
      amount: chargeCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: 'appointment_payment_link',
        appointment_id: appt.id,
        payment_link_token: token,
      },
      description: `${businessInfo.name} — Appointment ${appt.id.slice(0, 8)}`,
    });

    return NextResponse.json({
      clientSecret: pi.client_secret,
      amountCents: chargeCents,
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
