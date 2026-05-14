import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendSms } from '@/lib/utils/sms';
import { sendTemplatedEmail } from '@/lib/email/send-templated-email';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { getBusinessInfo } from '@/lib/data/business';
import { toCents, fromCents } from '@/lib/utils/refund-math';
import { STRIPE_MIN_AMOUNT_CENTS } from '@/lib/utils/money';

const TOKEN_LENGTH = 16;
const TOKEN_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_RETRIES = 3;

type Method = 'email' | 'sms' | 'both';
type ChannelStatus = 'sent' | 'skipped' | 'failed';
interface ChannelsResult {
  email?: ChannelStatus;
  sms?: ChannelStatus;
}

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

function formatScheduledTime(timeStr: string | null): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  if (Number.isNaN(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.padStart(2, '0')} ${period}`;
}

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
    // below against the recomputed remaining (we never trust the client's
    // remaining — staff could be looking at stale UI).
    const rawAmountCents: unknown = body?.amount_cents;
    let chosenAmountCents: number | null = null;
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
      chosenAmountCents = rawAmountCents;
    }

    const admin = createAdminClient();

    const { data: appt, error: apptErr } = await admin
      .from('appointments')
      .select(
        `id, status, payment_status, total_amount,
         scheduled_date, scheduled_start_time, payment_link_token,
         customer:customers(id, first_name, last_name, phone, email)`
      )
      .eq('id', id)
      .maybeSingle();

    if (apptErr) {
      console.error('[send-payment-link] appt lookup failed', {
        id,
        error: apptErr.message,
      });
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
    if (!appt) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    if (appt.status === 'cancelled' || appt.status === 'no_show') {
      return NextResponse.json(
        { error: `Appointment is ${appt.status}; cannot send payment link` },
        { status: 409 }
      );
    }
    if (appt.payment_status === 'paid') {
      return NextResponse.json(
        { error: 'Appointment is already paid' },
        { status: 409 }
      );
    }

    const customer = appt.customer as unknown as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      email: string | null;
    } | null;
    if (!customer) {
      return NextResponse.json(
        { error: 'No customer associated with appointment' },
        { status: 422 }
      );
    }

    // Strict 422 when a requested channel has no destination on file. UI is
    // expected to gate the send button so this stays a defensive guard.
    if ((method === 'email' || method === 'both') && !customer.email) {
      return NextResponse.json(
        { error: 'Customer has no email address on file' },
        { status: 422 }
      );
    }
    if ((method === 'sms' || method === 'both') && !customer.phone) {
      return NextResponse.json(
        { error: 'Customer has no phone number on file' },
        { status: 422 }
      );
    }

    // Remaining balance in cents — same math as the webhook + Session 2 page.
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
      return NextResponse.json(
        { error: 'Nothing left to pay on this appointment' },
        { status: 409 }
      );
    }

    // Server-side overpayment guard. Client clamps too, but staff could send
    // a stale UI request; reject anything > recomputed remaining.
    if (chosenAmountCents !== null && chosenAmountCents > remainingCents) {
      return NextResponse.json(
        {
          error: `amount_cents (${chosenAmountCents}) exceeds remaining balance (${remainingCents})`,
        },
        { status: 422 }
      );
    }

    // Effective link amount: explicit choice, or fall back to full remaining
    // (legacy callers who don't send amount_cents).
    const linkAmountCents = chosenAmountCents ?? remainingCents;

    // Token: reuse existing or mint new with retry on unique-violation.
    let token: string | null = appt.payment_link_token ?? null;
    if (!token) {
      let lastErr: string | undefined;
      for (let attempt = 0; attempt < TOKEN_RETRIES; attempt++) {
        const candidate = generateToken();
        const { error: updErr } = await admin
          .from('appointments')
          .update({ payment_link_token: candidate })
          .eq('id', appt.id)
          .is('payment_link_token', null);

        if (updErr) {
          // 23505 (unique_violation) on the partial unique index — retry with
          // a fresh candidate. Anything else surfaces as 500.
          lastErr = updErr.message;
          continue;
        }

        // Update succeeded OR no rows matched (parallel writer beat us). Re-read
        // to get the canonical value. The is_null guard guarantees we never
        // overwrite a winning concurrent write.
        const { data: re } = await admin
          .from('appointments')
          .select('payment_link_token')
          .eq('id', appt.id)
          .maybeSingle();
        token = re?.payment_link_token ?? null;
        if (token) break;
      }
      if (!token) {
        console.error('[send-payment-link] token generation exhausted', {
          id,
          error: lastErr,
        });
        return NextResponse.json(
          { error: 'Could not generate payment link token' },
          { status: 500 }
        );
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const payUrl = `${appUrl}/pay/${token}`;

    const linkAmountDollars = fromCents(linkAmountCents);
    // amount_due chip is the bare formatted dollar figure (e.g. "1.00"). The
    // SMS template body has the literal "$" before {amount_due}; the email
    // button text "Pay ${amount_due}" composes the same way. Chip carries the
    // chosen link amount (may be < remaining for partial-deposit flows).
    const amountDueChip = linkAmountDollars.toFixed(2);

    const dateStr = new Date(
      `${appt.scheduled_date}T${appt.scheduled_start_time}`
    ).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Los_Angeles',
    });
    const timeStr = formatScheduledTime(appt.scheduled_start_time);

    const channels: ChannelsResult = {};
    const errors: string[] = [];
    const shouldEmail = method === 'email' || method === 'both';
    const shouldSms = method === 'sms' || method === 'both';

    // ── Email ──
    if (shouldEmail && customer.email) {
      try {
        const result = await sendTemplatedEmail(customer.email, 'payment_link_sent', {
          first_name: customer.first_name ?? undefined,
          amount_due: amountDueChip,
          pay_url: payUrl,
          scheduled_date: dateStr,
          scheduled_time: timeStr,
        });
        if (result.usedTemplate && result.success) {
          channels.email = 'sent';
        } else {
          channels.email = 'failed';
          errors.push(
            result.error ||
              (!result.usedTemplate
                ? 'payment_link_sent email template missing or not customized'
                : 'Email send failed')
          );
        }
      } catch (err) {
        channels.email = 'failed';
        errors.push(err instanceof Error ? err.message : 'Email send threw');
      }
    }

    // ── SMS ──
    if (shouldSms && customer.phone) {
      try {
        const business = await getBusinessInfo();
        const fallback = customer.first_name
          ? `Hi ${customer.first_name},\nYour ${business.name} payment link for $${amountDueChip}: ${payUrl}`
          : `Your ${business.name} payment link for $${amountDueChip}: ${payUrl}`;

        const rendered = await renderSmsTemplate(
          'payment_link_sent',
          {
            first_name: customer.first_name ?? undefined,
            amount_due: amountDueChip,
            pay_url: payUrl,
          },
          fallback
        );

        if (!rendered.isActive) {
          channels.sms = 'skipped';
          errors.push('payment_link_sent SMS template is inactive');
        } else {
          const result = await sendSms(customer.phone, rendered.body, {
            customerId: customer.id,
            source: 'transactional',
            notificationType: 'payment_link_sent',
            contextId: appt.id,
          });
          if (result.success) {
            channels.sms = 'sent';
          } else {
            channels.sms = 'failed';
            errors.push(result.error);
          }
        }
      } catch (err) {
        channels.sms = 'failed';
        errors.push(err instanceof Error ? err.message : 'SMS send threw');
      }
    }

    const sentCount =
      (channels.email === 'sent' ? 1 : 0) + (channels.sms === 'sent' ? 1 : 0);

    if (sentCount === 0) {
      console.error('[send-payment-link] all channels failed', {
        id,
        method,
        channels,
        errors,
      });
      return NextResponse.json(
        { error: 'All channels failed', channels, errors },
        { status: 500 }
      );
    }

    // At least one channel succeeded. Persist the link amount and reset
    // payment_link_paid_at so a subsequent webhook event for THIS link isn't
    // short-circuited by the (legacy) paid_at guard. The webhook now uses
    // per-PI idempotency, but the reset keeps the column meaning consistent:
    // payment_link_paid_at = "is the *current* outstanding link paid?".
    // payment_link_amount_cents stores the chosen amount (NULL when caller
    // omitted amount_cents → "use full remaining at pay time").
    const { error: stampErr } = await admin
      .from('appointments')
      .update({
        payment_link_sent_at: new Date().toISOString(),
        payment_link_paid_at: null,
        payment_link_amount_cents: chosenAmountCents,
      })
      .eq('id', appt.id);
    if (stampErr) {
      console.error('[send-payment-link] failed to stamp payment_link_sent_at', {
        id,
        error: stampErr.message,
      });
      // Don't fail the response — the customer-facing send already succeeded.
    }

    return NextResponse.json({
      success: true,
      channels,
      payment_link_token: token,
      pay_url: payUrl,
      ...(errors.length > 0 ? { partial_errors: errors } : {}),
    });
  } catch (err) {
    console.error('[send-payment-link] unexpected error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
