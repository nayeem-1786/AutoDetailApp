import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo } from '@/lib/data/business';
import { toCents, fromCents } from '@/lib/utils/refund-math';
import { formatCurrency, formatMoney, formatTime, formatReceiptDateTime, formatPhone, phoneToE164 } from '@/lib/utils/format';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { PayForm } from './pay-form';
import { ProcessingRefresh } from './processing-refresh';

const PROCESSING_RETRY_LIMIT = 3;
const PROCESSING_REFRESH_SECONDS = 3;

interface AppointmentRecord {
  id: string;
  status: string;
  payment_status: string;
  total_amount: number;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  payment_link_paid_at: string | null;
  payment_link_amount_cents: number | null;
  customer: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
  } | null;
  appointment_services: Array<{
    id: string;
    price_at_booking: number;
    tier_name: string | null;
    service: { name: string } | null;
  }>;
}

async function getAppointmentByToken(
  token: string
): Promise<{
  appointment: AppointmentRecord;
  remainingCents: number;
  paidCents: number;
  chargeCents: number;
  /** When payment_link_paid_at is set, the cents amount of the most recent
   * payment on this appointment — i.e., what was charged via this consumed
   * link. Used by the link-paid confirmation panel. */
  linkPaidAmountCents: number | null;
} | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('appointments')
    .select(
      `
      id, status, payment_status, total_amount,
      scheduled_date, scheduled_start_time, scheduled_end_time,
      payment_link_paid_at, payment_link_amount_cents,
      customer:customers(first_name, last_name, email, phone),
      vehicle:vehicles(year, make, model, color),
      appointment_services(
        id, price_at_booking, tier_name,
        service:services(name)
      )
      `
    )
    .eq('payment_link_token', token)
    .maybeSingle();

  if (error || !data) return null;

  const appointment = data as unknown as AppointmentRecord;

  const totalCents = toCents(Number(appointment.total_amount));

  const { data: txs } = await supabase
    .from('transactions')
    .select('id')
    .eq('appointment_id', appointment.id);

  const txIds = (txs ?? []).map((t) => t.id);
  let paidCents = 0;
  let linkPaidAmountCents: number | null = null;
  if (txIds.length > 0) {
    const { data: pays } = await supabase
      .from('payments')
      .select('amount, created_at')
      .in('transaction_id', txIds)
      .order('created_at', { ascending: false });
    paidCents = (pays ?? []).reduce(
      (sum, p) => sum + toCents(Number(p.amount)),
      0
    );
    // Most-recent payment row drives the "link paid" confirmation amount when
    // payment_link_paid_at is set. The send route clears payment_link_paid_at
    // on each new send, so this window is bounded to "between webhook success
    // and next send" — the most recent payment is the link's payment by
    // construction in normal flows.
    if (appointment.payment_link_paid_at && pays && pays.length > 0) {
      linkPaidAmountCents = toCents(Number(pays[0].amount));
    }
  }

  const remainingCents = Math.max(0, totalCents - paidCents);
  // Charge amount: custom-amount link (Pay-Link Session 5) honored when set,
  // else full remaining. Clamped so the page never displays/charges more than
  // what's actually owed if remaining shrunk after link was issued.
  const chargeCents =
    typeof appointment.payment_link_amount_cents === 'number'
      ? Math.min(appointment.payment_link_amount_cents, remainingCents)
      : remainingCents;

  return {
    appointment,
    remainingCents,
    paidCents,
    chargeCents,
    linkPaidAmountCents,
  };
}

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const [result, businessInfo] = await Promise.all([
    getAppointmentByToken(token),
    getBusinessInfo(),
  ]);

  if (!result) {
    return {
      title: `Payment Link Not Found | ${businessInfo.name}`,
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Pay for Your Appointment | ${businessInfo.name}`,
    description: `Pay for your upcoming appointment with ${businessInfo.name}.`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicPayPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = await searchParams;

  const [result, businessInfo] = await Promise.all([
    getAppointmentByToken(token),
    getBusinessInfo(),
  ]);

  if (!result) {
    notFound();
  }

  const { appointment, remainingCents, paidCents, chargeCents, linkPaidAmountCents } = result;

  const redirectStatus = typeof sp.redirect_status === 'string' ? sp.redirect_status : null;
  const retryCountRaw = typeof sp.pl_retry === 'string' ? sp.pl_retry : '0';
  const retryCount = Math.max(0, Number.parseInt(retryCountRaw, 10) || 0);

  const isCancelled = appointment.status === 'cancelled' || appointment.status === 'no_show';
  const isPaid = appointment.payment_status === 'paid' || remainingCents <= 0;
  // "This link has been consumed" state. Distinct from isPaid because the
  // appointment may still have outstanding balance (e.g., $1 deposit link on a
  // $400 ticket) — but THIS link's contract with the customer was fulfilled
  // when the webhook stamped payment_link_paid_at. The page must NOT prompt
  // for the remaining balance; staff send a fresh link if more is owed
  // (Session 5-followup Bug 2).
  const isLinkConsumed = !isPaid && appointment.payment_link_paid_at !== null;
  const isProcessing =
    !isPaid &&
    !isLinkConsumed &&
    !isCancelled &&
    redirectStatus === 'succeeded' &&
    retryCount < PROCESSING_RETRY_LIMIT;

  // Custom-amount link active when this link's charge is < remaining AND the
  // link is unpaid (drives the "Total appointment: $X.XX" subtitle in the
  // totals block — only relevant before payment).
  const isPartialLink = !isPaid && !isLinkConsumed && chargeCents < remainingCents;

  // ---------- Branded shell helpers ----------
  const customerName = appointment.customer
    ? `${appointment.customer.first_name} ${appointment.customer.last_name}`.trim()
    : null;
  const vehicleStr = appointment.vehicle
    ? cleanVehicleDescription({
        year: appointment.vehicle.year,
        make: appointment.vehicle.make,
        model: appointment.vehicle.model,
      })
    : null;

  const totalAmountDollars = Number(appointment.total_amount);
  const chargeDollars = fromCents(chargeCents);
  const paidDollars = fromCents(paidCents);

  const scheduledDateStr = new Date(
    `${appointment.scheduled_date}T${appointment.scheduled_start_time}`
  ).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Business header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-site-text">{businessInfo.name}</h1>
        <p className="mt-1 text-sm text-site-text-muted">{businessInfo.address}</p>
      </div>

      {/* State header pill */}
      {isCancelled && (
        <div className="mb-4 text-center">
          <span className="inline-block rounded px-3 py-1 text-sm font-bold text-white bg-red-600">
            APPOINTMENT {appointment.status.toUpperCase().replace('_', ' ')}
          </span>
        </div>
      )}
      {isPaid && (
        <div className="mb-4 text-center">
          <span className="inline-block rounded px-3 py-1 text-sm font-bold text-white bg-green-600">
            PAID
          </span>
        </div>
      )}

      {/* Order summary */}
      <div className="mb-6 rounded-lg border border-site-border bg-brand-dark p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-site-text mb-4">Appointment</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-site-text-muted uppercase tracking-wide">
              Customer
            </p>
            {customerName ? (
              <p className="mt-1 text-sm text-site-text">{customerName}</p>
            ) : (
              <p className="mt-1 text-sm text-site-text-muted">—</p>
            )}
            {vehicleStr && (
              <p className="mt-1 text-sm text-site-text-muted">{vehicleStr}</p>
            )}
            {appointment.vehicle?.color && (
              <p className="text-sm text-site-text-muted">{appointment.vehicle.color}</p>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-site-text-muted uppercase tracking-wide">
              Scheduled
            </p>
            <p className="mt-1 text-sm text-site-text">{scheduledDateStr}</p>
            <p className="text-sm text-site-text-muted">
              {formatTime(appointment.scheduled_start_time)} –{' '}
              {formatTime(appointment.scheduled_end_time)} PST
            </p>
          </div>
        </div>

        {/* Services */}
        {appointment.appointment_services.length > 0 && (
          <div className="mt-6 border-t border-site-border pt-4">
            <p className="text-xs font-medium text-site-text-muted uppercase tracking-wide mb-2">
              Services
            </p>
            <ul className="space-y-2">
              {appointment.appointment_services.map((line) => (
                <li key={line.id} className="flex justify-between text-sm">
                  <span className="text-site-text">
                    {line.service?.name ?? 'Service'}
                    {line.tier_name && line.tier_name !== 'default' && (
                      <span className="text-site-text-muted"> — {line.tier_name}</span>
                    )}
                  </span>
                  <span className="text-site-text tabular-nums">
                    {formatCurrency(Number(line.price_at_booking))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Totals */}
        <div className="mt-6 border-t border-site-border pt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-site-text-muted">Total</span>
            <span className="text-site-text font-medium tabular-nums">
              {formatCurrency(totalAmountDollars)}
            </span>
          </div>
          {paidCents > 0 && (
            <div className="flex justify-between">
              <span className="text-site-text-muted">
                {appointment.payment_link_paid_at
                  ? `Paid (pay link) · ${formatReceiptDateTime(appointment.payment_link_paid_at)}`
                  : 'Already paid'}
              </span>
              <span className="text-blue-500 font-medium tabular-nums">
                -{formatCurrency(paidDollars)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-site-border pt-2">
            <span className="text-base font-semibold text-site-text">
              {isPaid ? 'Total Paid' : isLinkConsumed ? 'Link Paid' : 'Amount Due Now'}
            </span>
            <span className="text-lg font-bold text-site-text tabular-nums">
              {formatCurrency(
                isPaid
                  ? totalAmountDollars
                  : isLinkConsumed
                    ? fromCents(linkPaidAmountCents ?? 0)
                    : chargeDollars
              )}
            </span>
          </div>
          {isPartialLink && (
            <div className="flex justify-between text-xs text-site-text-muted">
              <span>Total appointment</span>
              <span className="tabular-nums">{formatCurrency(totalAmountDollars)}</span>
            </div>
          )}
        </div>
      </div>

      {/* State-specific body */}
      {isCancelled ? (
        <div className="rounded-lg border border-site-border bg-brand-dark p-6 text-center">
          <h3 className="text-base font-semibold text-site-text">
            This appointment is no longer payable.
          </h3>
          <p className="mt-2 text-sm text-site-text-muted">
            If you believe this is a mistake, please reach out to us at{' '}
            <a href={`tel:${phoneToE164(businessInfo.phone)}`} className="text-accent-brand">
              {formatPhone(businessInfo.phone)}
            </a>
            .
          </p>
        </div>
      ) : isPaid ? (
        <PaidCard
          businessName={businessInfo.name}
          paidAtIso={appointment.payment_link_paid_at}
          phone={businessInfo.phone}
        />
      ) : isLinkConsumed ? (
        <LinkPaidCard
          businessName={businessInfo.name}
          paidAtIso={appointment.payment_link_paid_at}
          paidAmountCents={linkPaidAmountCents}
          phone={businessInfo.phone}
        />
      ) : isProcessing ? (
        <ProcessingCard token={token} retryCount={retryCount} />
      ) : (
        <PayForm token={token} amountDueCents={chargeCents} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paid card
// ---------------------------------------------------------------------------

function PaidCard({
  businessName,
  paidAtIso,
  phone,
}: {
  businessName: string;
  paidAtIso: string | null;
  phone: string;
}) {
  return (
    <div className="rounded-lg border border-site-border bg-brand-dark p-6 text-center">
      <h3 className="text-lg font-semibold text-green-500">Payment received</h3>
      <p className="mt-2 text-sm text-site-text-muted">
        Thanks — your appointment has been paid in full.
      </p>
      {paidAtIso && (
        <p className="mt-1 text-xs text-site-text-muted">
          Paid on {formatReceiptDateTime(paidAtIso)} PST
        </p>
      )}
      <p className="mt-4 text-xs text-site-text-muted">
        Questions? Call {businessName} at{' '}
        <a href={`tel:${phoneToE164(phone)}`} className="text-accent-brand">
          {formatPhone(phone)}
        </a>
        .
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Link-paid card — appointment still has outstanding balance, but THIS link
// was paid. The customer's contract with this URL was for a specific amount
// and that amount has been received. No outstanding-balance prompt; staff
// send a fresh link if more is owed (Session 5-followup Bug 2).
// ---------------------------------------------------------------------------

function LinkPaidCard({
  businessName,
  paidAtIso,
  paidAmountCents,
  phone,
}: {
  businessName: string;
  paidAtIso: string | null;
  paidAmountCents: number | null;
  phone: string;
}) {
  return (
    <div className="rounded-lg border border-site-border bg-brand-dark p-6 text-center">
      <h3 className="text-lg font-semibold text-green-500">Payment received</h3>
      {paidAmountCents !== null && (
        <p className="mt-2 text-base text-site-text">
          <span className="font-semibold tabular-nums">
            {formatMoney(paidAmountCents)}
          </span>{' '}
          paid
        </p>
      )}
      <p className="mt-2 text-sm text-site-text-muted">
        Thanks — we&apos;ve received your payment for this link.
      </p>
      {paidAtIso && (
        <p className="mt-1 text-xs text-site-text-muted">
          Paid on {formatReceiptDateTime(paidAtIso)} PST
        </p>
      )}
      <p className="mt-4 text-xs text-site-text-muted">
        Questions? Call {businessName} at{' '}
        <a href={`tel:${phoneToE164(phone)}`} className="text-accent-brand">
          {formatPhone(phone)}
        </a>
        .
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Processing card — meta-refresh loop while waiting for the webhook to land.
// After PROCESSING_RETRY_LIMIT retries we fall through to the DB state, which
// either renders paid (success) or re-renders the form (rare race / failure).
// ---------------------------------------------------------------------------

function ProcessingCard({ token, retryCount }: { token: string; retryCount: number }) {
  const nextRetry = retryCount + 1;
  const refreshUrl = `/pay/${encodeURIComponent(token)}?redirect_status=succeeded&pl_retry=${nextRetry}`;

  return (
    <div className="rounded-lg border border-site-border bg-brand-dark p-8 text-center">
      <ProcessingRefresh url={refreshUrl} delaySeconds={PROCESSING_REFRESH_SECONDS} />
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-accent-ui" />
      <h3 className="mt-4 text-lg font-semibold text-site-text">Confirming payment…</h3>
      <p className="mt-2 text-sm text-site-text-muted">
        Stripe accepted your payment. We&apos;re finalizing the receipt.
        This page will refresh automatically.
      </p>
    </div>
  );
}
