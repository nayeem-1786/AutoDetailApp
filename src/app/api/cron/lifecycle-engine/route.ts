import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMarketingSms, sendSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { renderTemplate, cleanEmptyReviewLines, formatDollar, formatNumber } from '@/lib/utils/template';
import { formatPhone } from '@/lib/utils/format';
import { getBusinessInfo, BUSINESS_DEFAULTS } from '@/lib/data/business';
import { getBusinessHours, isWithinBusinessHours } from '@/lib/data/business-hours';
import { createShortLink } from '@/lib/utils/short-link';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { sendTemplatedEmail } from '@/lib/email/send-templated-email';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { runAutoEnrollments, checkAllStopConditions, processEnrollments } from '@/lib/email/drip-engine';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { humanizeAcceptedAgo } from '@/lib/quotes/customer-accept-service';
import { enrichItemsWithTierMeta, formatServicesSummary } from '@/lib/quotes/services-summary';
import { logAudit } from '@/lib/services/audit';
import type { EmailBlock } from '@/lib/email/types';

/**
 * Phase 3 Theme C.2 (AC-12) — SLA threshold for customer-accept appointments
 * pending staff acknowledgment. Initial value 2 hours (during business hours);
 * the cron's business-hours gate handles the "queue overnight, fire next 8am"
 * semantics naturally — outside hours the SLA scan is skipped entirely.
 *
 * Anti-spam: a per-appointment cooldown of 1 hour between SLA alert fires.
 * The dedup signal is an `audit_log` row with `action='update'` /
 * `entity_type='quote'` / `details.event='sla_alert_fired'` (NOT a new
 * column — per Theme C.2 prompt's "simpler is audit_log entry" lean).
 */
const AC12_SLA_THRESHOLD_MINUTES = 120;
const AC12_SLA_REFIRE_COOLDOWN_MINUTES = 60;

interface CouponTemplate {
  id: string;
  name: string | null;
  min_purchase: number | null;
  expires_at: string | null;
  coupon_rewards?: CouponTemplateReward[];
  [key: string]: unknown;
}

interface CouponTemplateReward {
  applies_to: string;
  discount_type: string;
  discount_value: number;
  max_discount: number | null;
  target_product_id: string | null;
  target_service_id: string | null;
  target_product_category_id: string | null;
  target_service_category_id: string | null;
}

/**
 * Lifecycle execution engine cron endpoint.
 *
 * Runs in six phases per invocation:
 *   Phase 0   — Drip: auto-enroll customers into drip sequences
 *   Phase 0.5 — Drip: check stop conditions on active enrollments
 *   Phase 1   — Schedule: find recent completions, insert pending lifecycle_executions
 *   Phase 2   — Execute: send SMS/email for executions whose scheduled_for <= now
 *   Phase 3   — Drip: execute pending drip steps
 *   Phase 4   — AC-12 SLA: alert staff on customer-accepted pending appointments
 *               unacknowledged past the threshold (business-hours-gated)
 *
 * Designed to be called every 5–15 minutes by an external scheduler or Vercel Cron.
 *
 * Example: curl -H "x-api-key: YOUR_KEY" https://domain.com/api/cron/lifecycle-engine
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const lookbackWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let scheduled = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  // Drip stats
  let dripEnrolled = 0;
  let dripStopped = 0;
  let dripProcessed = 0;
  let dripSent = 0;

  // Phase 3 Theme C.2 (AC-12) SLA stats
  let slaAlertsFired = 0;
  let slaAlertsSkippedHours = 0;
  let slaAlertsSkippedCooldown = 0;
  let slaAlertsSkippedNoRecipients = 0;

  // =========================================================================
  // Phase 0: Auto-enroll customers into drip sequences
  // =========================================================================

  try {
    dripEnrolled = await runAutoEnrollments(admin);
  } catch (err) {
    console.error('[Lifecycle] Drip auto-enrollment failed:', err);
  }

  // =========================================================================
  // Phase 0.5: Check stop conditions on all active drip enrollments
  // =========================================================================

  try {
    dripStopped = await checkAllStopConditions(admin);
  } catch (err) {
    console.error('[Lifecycle] Drip stop condition check failed:', err);
  }

  // =========================================================================
  // Phase 1: Schedule new executions from recent trigger events
  // =========================================================================

  const { data: rules, error: rulesErr } = await admin
    .from('lifecycle_rules')
    .select('*')
    .eq('is_active', true);

  if (rulesErr) {
    console.error('Failed to load lifecycle rules:', rulesErr);
    return NextResponse.json({ error: 'Failed to load rules' }, { status: 500 });
  }

  if (rules && rules.length > 0) {
    const byTrigger = (cond: string) => rules.filter((r) => r.trigger_condition === cond);

    const serviceRules = byTrigger('service_completed');
    const transactionRules = byTrigger('after_transaction');
    const workCompletedRules = byTrigger('after_work_completed');
    const apptBookedRules = byTrigger('after_appointment_booked');
    const apptCancelledRules = byTrigger('after_appointment_cancelled');
    const quoteAcceptedRules = byTrigger('after_quote_accepted');

    if (serviceRules.length > 0) {
      scheduled += await scheduleFromCompletedJobs(admin, serviceRules, lookbackWindow, thirtyDaysAgo);
    }

    if (transactionRules.length > 0) {
      scheduled += await scheduleFromTransactions(admin, transactionRules, lookbackWindow, thirtyDaysAgo);
    }

    if (workCompletedRules.length > 0) {
      scheduled += await scheduleFromWorkCompleted(admin, workCompletedRules, lookbackWindow, thirtyDaysAgo);
    }

    if (apptBookedRules.length > 0) {
      scheduled += await scheduleFromAppointmentBooked(admin, apptBookedRules, lookbackWindow, thirtyDaysAgo);
    }

    if (apptCancelledRules.length > 0) {
      scheduled += await scheduleFromAppointmentCancelled(admin, apptCancelledRules, lookbackWindow, thirtyDaysAgo);
    }

    if (quoteAcceptedRules.length > 0) {
      scheduled += await scheduleFromQuoteAccepted(admin, quoteAcceptedRules, lookbackWindow, thirtyDaysAgo);
    }
  }

  // =========================================================================
  // Phase 2: Execute pending scheduled actions
  // =========================================================================

  const { data: pendingExecs, error: pendingErr } = await admin
    .from('lifecycle_executions')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(100);

  if (pendingErr) {
    console.error('Failed to load pending executions:', pendingErr);
  }

  if (pendingExecs && pendingExecs.length > 0) {
    // Check marketing feature flags before sending
    const [smsMarketingEnabled, emailMarketingEnabled] = await Promise.all([
      isFeatureEnabled(FEATURE_FLAGS.SMS_MARKETING),
      isFeatureEnabled(FEATURE_FLAGS.EMAIL_MARKETING),
    ]);
    if (!smsMarketingEnabled && !emailMarketingEnabled) {
      console.log(`[Lifecycle] Both SMS and Email Marketing disabled — skipping ${pendingExecs.length} pending executions`);
      // Don't skip Phase 1 (scheduling) — just skip Phase 2 (sending)
      // When marketing is re-enabled, pending executions will send
    } else {
      const results = await executePending(admin, pendingExecs, smsMarketingEnabled, emailMarketingEnabled);
      sent += results.sent;
      failed += results.failed;
      skipped += results.skipped;
    }
  }

  // =========================================================================
  // Phase 3: Execute pending drip steps
  // =========================================================================

  try {
    const dripResult = await processEnrollments(admin);
    dripProcessed = dripResult.processed;
    dripSent = dripResult.sent;
  } catch (err) {
    console.error('[Lifecycle] Drip step execution failed:', err);
  }

  // =========================================================================
  // Phase 4: AC-12 SLA — staff alert on customer-accepted pending appointments
  // unacknowledged past the threshold (business-hours-gated)
  // =========================================================================
  //
  // The query identifies appointments created via the customer-accept seam
  // (`channel='customer_accept'` per Theme C.1 enum addition) that have not
  // been acknowledged by staff (`staff_acknowledged_at IS NULL` per Theme C.1
  // column) and have been pending longer than the threshold. The threshold
  // is interpreted as wall-clock minutes from `created_at` regardless of
  // business hours — the BUSINESS-HOURS gate is on the FIRE itself, not on
  // threshold accrual. Outside hours we don't fire (so a quote accepted at
  // midnight doesn't blow up the owner's phone); the next 8am tick catches
  // it because by then it's well past 2h AND inside hours.
  //
  // Anti-spam: a per-appointment cooldown via audit_log lookup. If we fired
  // an SLA alert for this appointment in the past 60 minutes, skip; the
  // staff member presumably saw the prior one. Acknowledgment (= setting
  // staff_acknowledged_at) drops the row out of the query entirely on the
  // next pass.
  //
  // The dispatch path is the canonical sendSms() chokepoint (NOT
  // sendMarketingSms — staff alerts must not be silenced by the customer
  // SMS_MARKETING / EMAIL_MARKETING feature flags). Recipient resolution
  // matches the orchestrator's pattern: template `recipient_phones` →
  // empty fallback + console.warn (per Session #139 self-send-safe).
  try {
    const businessHours = await getBusinessHours();
    const businessHoursNow = businessHours ? isWithinBusinessHours(businessHours) : false;

    if (!businessHoursNow) {
      // Outside business hours — skip the scan entirely. Empty `pendingAppts`
      // would otherwise still consume a roundtrip; explicit skip is more
      // readable AND lets the response telemetry distinguish "no candidates"
      // from "hours-gated."
      slaAlertsSkippedHours = 1;
    } else {
      const thresholdIso = new Date(
        now.getTime() - AC12_SLA_THRESHOLD_MINUTES * 60 * 1000
      ).toISOString();
      const cooldownIso = new Date(
        now.getTime() - AC12_SLA_REFIRE_COOLDOWN_MINUTES * 60 * 1000
      ).toISOString();

      const { data: pendingAppts, error: pendingApptErr } = await admin
        .from('appointments')
        .select(`
          id,
          quote_id,
          customer_id,
          created_at,
          customer:customers(id, first_name, last_name),
          quote:quotes(id, quote_number, items:quote_items(*))
        `)
        .eq('channel', 'customer_accept')
        .eq('status', 'pending')
        .is('staff_acknowledged_at', null)
        .lte('created_at', thresholdIso)
        .not('quote_id', 'is', null)
        .limit(50);

      if (pendingApptErr) {
        console.error('[Lifecycle SLA] Failed to query pending appointments:', pendingApptErr);
      } else if (pendingAppts && pendingAppts.length > 0) {
        // Pre-flight: load any recent SLA-alert audit_log rows for these
        // quote ids so we can dedup in-batch without N+1 queries.
        const quoteIds = pendingAppts
          .map((a) => a.quote_id)
          .filter((id): id is string => typeof id === 'string');

        const recentAlertedQuoteIds = new Set<string>();
        if (quoteIds.length > 0) {
          const { data: recentAlerts } = await admin
            .from('audit_log')
            .select('entity_id')
            .eq('entity_type', 'quote')
            .in('entity_id', quoteIds)
            .gte('created_at', cooldownIso);
          // details->>event = 'sla_alert_fired' is the discriminator. We
          // over-fetch (any 'quote' update in the cooldown window) and
          // filter client-side via the `details` JSONB. A server-side
          // `->>` filter is possible but the volume is bounded (50 quotes
          // max × ~hours of audit traffic per quote) so this is fine.
          for (const row of recentAlerts || []) {
            // Without re-fetching details, treat any audit_log entry in
            // the cooldown window as a cooldown signal. This is more
            // conservative than ideal (a legit non-SLA quote update would
            // suppress the SLA alert), but the over-suppression failure
            // mode is preferable to over-spam, and the legit-update case
            // is rare for an unacknowledged customer-accept pending
            // appointment by definition.
            if (row.entity_id) recentAlertedQuoteIds.add(row.entity_id);
          }
        }

        for (const appt of pendingAppts) {
          const quoteId = appt.quote_id;
          if (!quoteId) continue;
          if (recentAlertedQuoteIds.has(quoteId)) {
            slaAlertsSkippedCooldown++;
            continue;
          }

          const fired = await fireSlaAlert(admin, appt, now);
          if (fired === 'fired') {
            slaAlertsFired++;
            // Audit row IS the cooldown signal — write immediately so a
            // subsequent within-batch fire for the same quote (impossible
            // structurally — quote_id is UNIQUE per Theme C.1) is also
            // covered.
            logAudit({
              action: 'update',
              entityType: 'quote',
              entityId: quoteId,
              entityLabel: `Quote SLA alert (appointment ${appt.id})`,
              details: {
                event: 'sla_alert_fired',
                appointment_id: appt.id,
                appointment_age_minutes: Math.floor(
                  (now.getTime() - new Date(appt.created_at as string).getTime()) /
                    (60 * 1000)
                ),
              },
              source: 'cron',
            });
            recentAlertedQuoteIds.add(quoteId);
          } else if (fired === 'no_recipients') {
            slaAlertsSkippedNoRecipients++;
          }
        }
      }
    }
  } catch (err) {
    console.error('[Lifecycle SLA] AC-12 phase failed (non-blocking):', err);
  }

  return NextResponse.json({
    scheduled, sent, failed, skipped,
    drip: { enrolled: dripEnrolled, stopped: dripStopped, processed: dripProcessed, sent: dripSent },
    sla: {
      fired: slaAlertsFired,
      skipped_hours: slaAlertsSkippedHours,
      skipped_cooldown: slaAlertsSkippedCooldown,
      skipped_no_recipients: slaAlertsSkippedNoRecipients,
    },
  });
}

// ===========================================================================
// Phase 4 — AC-12 SLA alert dispatch (single appointment)
// ===========================================================================

interface PendingApptForSla {
  id: string;
  quote_id: string | null;
  customer_id: string | null;
  created_at: string;
  customer: {
    id: string;
    first_name: string;
    last_name: string;
  } | { id: string; first_name: string; last_name: string }[] | null;
  quote: {
    id: string;
    quote_number: string | number;
    items: Array<{
      service_id: string | null;
      item_name: string;
      tier_name: string | null;
      quantity: number;
      unit_price: number | string;
      total_price?: number | string | null;
    }>;
  } | { id: string; quote_number: string | number; items: Array<unknown> }[] | null;
}

type SlaFireOutcome = 'fired' | 'no_recipients' | 'no_template' | 'error';

async function fireSlaAlert(
  admin: ReturnType<typeof createAdminClient>,
  appt: Record<string, unknown>,
  now: Date
): Promise<SlaFireOutcome> {
  try {
    const typed = appt as unknown as PendingApptForSla;
    // PostgREST single-row FK embed may resolve to either a single object
    // or an array depending on the constraint inferred (per CLAUDE.md
    // "Supabase relation cardinality" rule — both `customer:customers` and
    // `quote:quotes` are joined on UUID FKs which are single-object shaped,
    // but the Memory-locked rule "always normalize" applies). Both
    // relations are not-null per the query filter so the empty-array case
    // shouldn't occur, but defense-in-depth.
    const customer = Array.isArray(typed.customer)
      ? typed.customer[0] ?? null
      : typed.customer;
    const quote = Array.isArray(typed.quote)
      ? typed.quote[0] ?? null
      : typed.quote;

    if (!customer || !quote) {
      return 'error';
    }

    const customerName = `${customer.first_name} ${customer.last_name}`.trim() || 'Customer';
    const acceptedAtHuman = humanizeAcceptedAgo(
      now.getTime() - new Date(typed.created_at).getTime()
    );

    const rawItems = (quote.items as Array<{
      service_id: string | null;
      item_name: string;
      tier_name: string | null;
      quantity: number;
      unit_price: number | string;
      total_price?: number | string | null;
    }>) ?? [];
    const enriched = await enrichItemsWithTierMeta(
      admin,
      rawItems.map((i) => ({
        service_id: i.service_id,
        item_name: i.item_name,
        tier_name: i.tier_name,
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        total_price: i.total_price,
      }))
    );
    const services = formatServicesSummary(enriched) || 'Services';

    const fallback = `⏰ Customer-accepted quote awaiting confirmation.\nQuote ${quote.quote_number} from ${customerName} for ${services}.\nAccepted ${acceptedAtHuman}.\nPlease confirm or follow up.`;
    const result = await renderSmsTemplate(
      'pending_appointment_sla_alert',
      {
        quote_number: String(quote.quote_number ?? ''),
        customer_name: customerName,
        services,
        accepted_at_human: acceptedAtHuman,
      },
      fallback
    );

    if (!result.isActive) return 'no_template';

    const recipients: string[] = result.recipientPhones?.length ? result.recipientPhones : [];
    if (recipients.length === 0) {
      console.warn(
        `[Lifecycle SLA] Alert dropped — no recipient_phones configured for "pending_appointment_sla_alert" template ` +
          `(appointment ${typed.id}). Configure via Admin → SMS Templates.`
      );
      return 'no_recipients';
    }

    const sends = await Promise.allSettled(
      recipients.map((phone) => sendSms(phone, result.body))
    );
    const anyDelivered = sends.some(
      (r) => r.status === 'fulfilled' && r.value && r.value.success === true
    );
    return anyDelivered ? 'fired' : 'error';
  } catch (err) {
    console.error('[Lifecycle SLA] fireSlaAlert failed:', err);
    return 'error';
  }
}

// ===========================================================================
// Phase 1A — Schedule from closed jobs (work done + paid via POS)
// ===========================================================================
//
// Session RFB-2: dropped the `actual_pickup_at IS NOT NULL` requirement that
// Session RFB-1 introduced. The pickup workflow turned out to be unreachable
// for walk-ins (the button only renders for status='completed' and is replaced
// by "Paid" once link-transaction flips status to 'closed'). RFB-2 also fully
// removed the pickup endpoint + button. Gate now means simply:
//   work done + paid → jobs.status = 'closed' (POS rang the job up)
//
// Admin-manual `appointments.status='completed'` overrides still do NOT trigger
// because no jobs row is touched by that path.

interface Rule {
  id: string;
  trigger_service_id: string | null;
  delay_days: number;
  delay_minutes: number;
  [key: string]: unknown;
}

async function scheduleFromCompletedJobs(
  admin: ReturnType<typeof createAdminClient>,
  rules: Rule[],
  lookbackWindow: string,
  thirtyDaysAgo: string
): Promise<number> {
  const { data: jobs, error } = await admin
    .from('jobs')
    .select(`
      id,
      appointment_id,
      transaction_id,
      customer_id,
      updated_at,
      services,
      customers!inner(id, phone, email, sms_consent, email_consent)
    `)
    .eq('status', 'closed')
    .gte('updated_at', lookbackWindow)
    .not('customer_id', 'is', null);

  if (error || !jobs?.length) {
    if (error) console.error('Failed to query closed jobs:', error);
    return 0;
  }

  return scheduleExecutions(
    admin,
    rules,
    jobs.map((j) => {
      const serviceIds = Array.isArray(j.services)
        ? (j.services as Array<{ service_id?: string | null }>)
            .map((s) => s?.service_id)
            .filter((sid): sid is string => typeof sid === 'string' && sid.length > 0)
        : [];
      return {
        sourceId: j.id,
        sourceField: 'job_id' as const,
        appointmentId: j.appointment_id,
        transactionId: j.transaction_id,
        customerId: j.customer_id!,
        triggeredAt: j.updated_at,
        customer: j.customers as unknown as { phone: string | null; email: string | null; sms_consent: boolean; email_consent: boolean },
        serviceIds,
      };
    }),
    'job_closed',
    thirtyDaysAgo
  );
}

// ===========================================================================
// Phase 1B — Schedule from completed transactions (product-only POS sales)
// ===========================================================================
//
// Session RFB-1: this path is now restricted to non-service POS transactions.
// Service-tied transactions (linked to an appointment, OR linked from any
// jobs.transaction_id) are handled by scheduleFromCompletedJobs above; firing
// `after_transaction` rules on them would cause dual-firing (Q3 — "non-
// overlapping populations"). Pure product POS sales (walk-in supply purchase,
// retail-only checkout) still trigger immediately on transaction completion.

async function scheduleFromTransactions(
  admin: ReturnType<typeof createAdminClient>,
  rules: Rule[],
  lookbackWindow: string,
  thirtyDaysAgo: string
): Promise<number> {
  // Phase 0a note: post-eager-appointment-creation, walk-in service transactions
  // carry a non-null appointment_id (and are also referenced by jobs.transaction_id),
  // so they fall out of this query naturally — leaving "pure product POS sales"
  // (retail-only checkout, no job ever attached) as the only remaining matches.
  // Pre-Phase-0a walk-in service transactions still have appointment_id IS NULL;
  // the secondary jobs.transaction_id filter below excludes those.
  const { data: transactions, error } = await admin
    .from('transactions')
    .select(`
      id,
      appointment_id,
      customer_id,
      transaction_date,
      customers!inner(id, phone, email, sms_consent, email_consent),
      transaction_items(service_id)
    `)
    .eq('status', 'completed')
    .is('appointment_id', null)
    .gte('transaction_date', lookbackWindow)
    .not('customer_id', 'is', null);

  if (error || !transactions?.length) {
    if (error) console.error('Failed to query completed transactions:', error);
    return 0;
  }

  // Second-level filter: also exclude transactions referenced by any job
  // (jobs.transaction_id = tx.id). These are service-checkout transactions
  // even when appointment_id is NULL (walk-in service flow, where the job
  // has no appointment but is still a service ticket).
  const txIds = transactions.map((t) => t.id);
  const { data: jobsLinkingTxs } = await admin
    .from('jobs')
    .select('transaction_id')
    .in('transaction_id', txIds)
    .not('transaction_id', 'is', null);

  const serviceTxIds = new Set(
    (jobsLinkingTxs || []).map((j) => j.transaction_id as string)
  );

  const productOnly = transactions.filter((tx) => !serviceTxIds.has(tx.id));
  if (productOnly.length === 0) return 0;

  return scheduleExecutions(
    admin,
    rules,
    productOnly.map((tx) => ({
      sourceId: tx.id,
      sourceField: 'transaction_id' as const,
      appointmentId: null,
      transactionId: tx.id,
      customerId: tx.customer_id!,
      triggeredAt: tx.transaction_date,
      customer: tx.customers as unknown as { phone: string | null; email: string | null; sms_consent: boolean; email_consent: boolean },
      serviceIds: ((tx.transaction_items || []) as Array<{ service_id: string | null }>)
        .map((i) => i.service_id)
        .filter(Boolean) as string[],
    })),
    'transaction_completed',
    thirtyDaysAgo
  );
}

// ===========================================================================
// Phase 1C — Schedule from work-completed jobs (detailer marked done)
// ===========================================================================
//
// Session RFB-2: fires when jobs.status='completed' (work physically done by
// the detailer, before POS checkout). Independent from `service_completed`
// (which gates on jobs.status='closed'). The same job can match both rules
// at different lifecycle stages — dedup is per (rule_id, job_id), so two
// different rules don't collide.

async function scheduleFromWorkCompleted(
  admin: ReturnType<typeof createAdminClient>,
  rules: Rule[],
  lookbackWindow: string,
  thirtyDaysAgo: string
): Promise<number> {
  // work_completed_at is set exactly once when status flips to 'completed'
  // (see /api/pos/jobs/[id]/complete). Use it directly so jobs that already
  // closed and got their updated_at bumped by later edits don't backfire.
  const { data: jobs, error } = await admin
    .from('jobs')
    .select(`
      id,
      appointment_id,
      transaction_id,
      customer_id,
      work_completed_at,
      services,
      customers!inner(id, phone, email, sms_consent, email_consent)
    `)
    .eq('status', 'completed')
    .gte('work_completed_at', lookbackWindow)
    .not('customer_id', 'is', null);

  if (error || !jobs?.length) {
    if (error) console.error('Failed to query work-completed jobs:', error);
    return 0;
  }

  return scheduleExecutions(
    admin,
    rules,
    jobs.map((j) => {
      const serviceIds = Array.isArray(j.services)
        ? (j.services as Array<{ service_id?: string | null }>)
            .map((s) => s?.service_id)
            .filter((sid): sid is string => typeof sid === 'string' && sid.length > 0)
        : [];
      return {
        sourceId: j.id,
        sourceField: 'job_id' as const,
        appointmentId: j.appointment_id,
        transactionId: j.transaction_id,
        customerId: j.customer_id!,
        triggeredAt: j.work_completed_at!,
        customer: j.customers as unknown as { phone: string | null; email: string | null; sms_consent: boolean; email_consent: boolean },
        serviceIds,
      };
    }),
    'work_completed',
    thirtyDaysAgo
  );
}

// ===========================================================================
// Phase 1D — Schedule from newly-booked appointments
// ===========================================================================
//
// Session RFB-2. Excludes already-cancelled / no-show appointments at scheduling
// time so a book-then-cancel within the cron tick doesn't queue an obsolete
// "thanks for booking" send.

async function scheduleFromAppointmentBooked(
  admin: ReturnType<typeof createAdminClient>,
  rules: Rule[],
  lookbackWindow: string,
  thirtyDaysAgo: string
): Promise<number> {
  // Phase 0a: walk-ins now eagerly create a synthetic appointment row, but they
  // are not "bookings" in the lifecycle sense — booking-confirmation comms,
  // welcome flows, etc. shouldn't fire for someone who walked in. Closed-job
  // follow-ups still reach walk-ins via scheduleFromCompletedJobs.
  const { data: appointments, error } = await admin
    .from('appointments')
    .select(`
      id,
      customer_id,
      created_at,
      status,
      customers!inner(id, phone, email, sms_consent, email_consent),
      appointment_services(service_id)
    `)
    .gte('created_at', lookbackWindow)
    .not('customer_id', 'is', null)
    .not('status', 'in', '(cancelled,no_show)')
    .neq('channel', 'walk_in');

  if (error || !appointments?.length) {
    if (error) console.error('Failed to query newly-booked appointments:', error);
    return 0;
  }

  return scheduleExecutions(
    admin,
    rules,
    appointments.map((a) => ({
      sourceId: a.id,
      sourceField: 'appointment_id' as const,
      appointmentId: a.id,
      transactionId: null,
      customerId: a.customer_id!,
      triggeredAt: a.created_at,
      customer: a.customers as unknown as { phone: string | null; email: string | null; sms_consent: boolean; email_consent: boolean },
      serviceIds: ((a.appointment_services || []) as Array<{ service_id: string | null }>)
        .map((s) => s.service_id)
        .filter((sid): sid is string => typeof sid === 'string' && sid.length > 0),
    })),
    'appointment_booked',
    thirtyDaysAgo
  );
}

// ===========================================================================
// Phase 1E — Schedule from cancelled appointments
// ===========================================================================
//
// Session RFB-2. Per-appointment dedup means cascade-cancels (job cancel that
// flips its linked appointment to cancelled) won't double-fire this rule —
// the appointment_id is unique per execution.

async function scheduleFromAppointmentCancelled(
  admin: ReturnType<typeof createAdminClient>,
  rules: Rule[],
  lookbackWindow: string,
  thirtyDaysAgo: string
): Promise<number> {
  // Phase 0a: walk-in cancellations now flip the synthetic appointment to
  // cancelled too. But "after_appointment_cancelled" rules (e.g., rebooking
  // offers, missed-you discounts) shouldn't fire for walk-in cancels —
  // there was no booking to cancel.
  const { data: appointments, error } = await admin
    .from('appointments')
    .select(`
      id,
      customer_id,
      updated_at,
      customers!inner(id, phone, email, sms_consent, email_consent),
      appointment_services(service_id)
    `)
    .eq('status', 'cancelled')
    .gte('updated_at', lookbackWindow)
    .not('customer_id', 'is', null)
    .neq('channel', 'walk_in');

  if (error || !appointments?.length) {
    if (error) console.error('Failed to query cancelled appointments:', error);
    return 0;
  }

  return scheduleExecutions(
    admin,
    rules,
    appointments.map((a) => ({
      sourceId: a.id,
      sourceField: 'appointment_id' as const,
      appointmentId: a.id,
      transactionId: null,
      customerId: a.customer_id!,
      triggeredAt: a.updated_at,
      customer: a.customers as unknown as { phone: string | null; email: string | null; sms_consent: boolean; email_consent: boolean },
      serviceIds: ((a.appointment_services || []) as Array<{ service_id: string | null }>)
        .map((s) => s.service_id)
        .filter((sid): sid is string => typeof sid === 'string' && sid.length > 0),
    })),
    'appointment_cancelled',
    thirtyDaysAgo
  );
}

// ===========================================================================
// Phase 1F — Schedule from accepted quotes
// ===========================================================================
//
// Session RFB-2. Dedup on quote_id (new column added in this session). A
// follow-on convert-to-appointment will independently fire after_appointment_booked
// — that's the desired behavior; the two rules are operator-configurable.

async function scheduleFromQuoteAccepted(
  admin: ReturnType<typeof createAdminClient>,
  rules: Rule[],
  lookbackWindow: string,
  thirtyDaysAgo: string
): Promise<number> {
  const { data: quotes, error } = await admin
    .from('quotes')
    .select(`
      id,
      customer_id,
      accepted_at,
      customer:customers!inner(id, phone, email, sms_consent, email_consent),
      items:quote_items(service_id)
    `)
    .eq('status', 'accepted')
    .gte('accepted_at', lookbackWindow)
    .is('deleted_at', null)
    .not('customer_id', 'is', null);

  if (error || !quotes?.length) {
    if (error) console.error('Failed to query accepted quotes:', error);
    return 0;
  }

  return scheduleExecutions(
    admin,
    rules,
    quotes.map((q) => ({
      sourceId: q.id,
      sourceField: 'quote_id' as const,
      appointmentId: null,
      transactionId: null,
      quoteId: q.id,
      customerId: q.customer_id!,
      triggeredAt: q.accepted_at!,
      customer: q.customer as unknown as { phone: string | null; email: string | null; sms_consent: boolean; email_consent: boolean },
      serviceIds: ((q.items || []) as Array<{ service_id: string | null }>)
        .map((i) => i.service_id)
        .filter((sid): sid is string => typeof sid === 'string' && sid.length > 0),
    })),
    'quote_accepted',
    thirtyDaysAgo
  );
}

// ===========================================================================
// Shared scheduling logic (dedup + insert)
// ===========================================================================

interface TriggerEvent {
  sourceId: string;
  sourceField: 'appointment_id' | 'transaction_id' | 'job_id' | 'quote_id';
  // Cross-references propagated to lifecycle_executions for traceability,
  // even when not part of the dedup key.
  appointmentId?: string | null;
  transactionId?: string | null;
  quoteId?: string | null;
  customerId: string;
  triggeredAt: string;
  customer: { phone: string | null; email: string | null; sms_consent: boolean; email_consent: boolean };
  serviceIds: string[];
}

async function scheduleExecutions(
  admin: ReturnType<typeof createAdminClient>,
  rules: Rule[],
  events: TriggerEvent[],
  triggerEvent: string,
  thirtyDaysAgo: string
): Promise<number> {
  const ruleIds = rules.map((r) => r.id);
  const sourceIds = events.map((e) => e.sourceId);
  const customerIds = [...new Set(events.map((e) => e.customerId))];

  // Dedup: already-scheduled executions for these source IDs
  const sourceField = events[0]?.sourceField;
  const { data: existingBySource } = await admin
    .from('lifecycle_executions')
    .select('lifecycle_rule_id, appointment_id, transaction_id, job_id, quote_id')
    .in('lifecycle_rule_id', ruleIds)
    .in(sourceField, sourceIds);

  const sourceDedupSet = new Set(
    (existingBySource || []).map((e) => {
      const sid =
        sourceField === 'appointment_id' ? e.appointment_id :
        sourceField === 'transaction_id' ? e.transaction_id :
        sourceField === 'quote_id' ? e.quote_id :
        e.job_id;
      return `${e.lifecycle_rule_id}:${sid}`;
    })
  );

  // Dedup: 30-day per-customer-per-rule limit
  const { data: recentByCustomer } = await admin
    .from('lifecycle_executions')
    .select('lifecycle_rule_id, customer_id')
    .in('lifecycle_rule_id', ruleIds)
    .in('customer_id', customerIds)
    .gte('created_at', thirtyDaysAgo);

  const customerDedupSet = new Set(
    (recentByCustomer || []).map((e) => `${e.lifecycle_rule_id}:${e.customer_id}`)
  );

  const toInsert: Array<Record<string, unknown>> = [];

  for (const event of events) {
    // Skip if customer has no contactable channel
    const hasPhone = event.customer?.phone && event.customer.sms_consent;
    const hasEmail = event.customer?.email && event.customer.email_consent;
    if (!hasPhone && !hasEmail) continue;

    for (const rule of rules) {
      if (sourceDedupSet.has(`${rule.id}:${event.sourceId}`)) continue;
      if (customerDedupSet.has(`${rule.id}:${event.customerId}`)) continue;

      // Service filter: rule targeting a specific service must match
      if (rule.trigger_service_id && !event.serviceIds.includes(rule.trigger_service_id)) continue;

      const delayMs = (rule.delay_days * 1440 + (rule.delay_minutes || 0)) * 60 * 1000;
      const scheduledFor = new Date(new Date(event.triggeredAt).getTime() + delayMs).toISOString();

      // Build the row — set the source-field column AND propagate any
      // cross-references for traceability. The unique-trigger index includes
      // appointment_id, transaction_id, job_id, AND quote_id (RFB-2) so
      // distinct sources never collide.
      const row: Record<string, unknown> = {
        lifecycle_rule_id: rule.id,
        customer_id: event.customerId,
        trigger_event: triggerEvent,
        triggered_at: event.triggeredAt,
        scheduled_for: scheduledFor,
        status: 'pending',
        [event.sourceField]: event.sourceId,
      };
      if (event.appointmentId !== undefined && event.sourceField !== 'appointment_id') {
        row.appointment_id = event.appointmentId;
      }
      if (event.transactionId !== undefined && event.sourceField !== 'transaction_id') {
        row.transaction_id = event.transactionId;
      }
      if (event.quoteId !== undefined && event.sourceField !== 'quote_id') {
        row.quote_id = event.quoteId;
      }
      toInsert.push(row);

      // Mark in dedup sets to prevent dups within same batch
      sourceDedupSet.add(`${rule.id}:${event.sourceId}`);
      customerDedupSet.add(`${rule.id}:${event.customerId}`);
    }
  }

  if (toInsert.length === 0) return 0;

  const { data: inserted, error } = await admin
    .from('lifecycle_executions')
    .insert(toInsert)
    .select('id');

  if (error) {
    if (error.code === '23505') {
      console.log('Some executions already existed (unique constraint), skipping duplicates');
    } else {
      console.error('Failed to insert lifecycle executions:', error);
    }
  }

  return inserted?.length ?? 0;
}

// ===========================================================================
// Phase 2 — Execute pending lifecycle actions
// ===========================================================================

interface PendingExecution {
  id: string;
  lifecycle_rule_id: string;
  customer_id: string;
  appointment_id: string | null;
  transaction_id: string | null;
  // Session RPB-1: type-strict job_id (column added in RFB-1; populated by
  // scheduleFromCompletedJobs). executePending reads it to look up the
  // assigned detailer's first name for the {detailer_first_name} token.
  job_id: string | null;
  trigger_event: string;
  [key: string]: unknown;
}

async function executePending(
  admin: ReturnType<typeof createAdminClient>,
  executions: PendingExecution[],
  smsMarketingEnabled: boolean,
  emailMarketingEnabled: boolean
): Promise<{ sent: number; failed: number; skipped: number }> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  // Pre-load all referenced rules
  const ruleIds = [...new Set(executions.map((e) => e.lifecycle_rule_id))];
  const { data: rulesData } = await admin
    .from('lifecycle_rules')
    .select('*')
    .in('id', ruleIds);

  const rulesMap = new Map((rulesData || []).map((r) => [r.id, r]));

  // Pre-load coupon templates for rules that have coupon_id
  const couponIds = [...new Set(
    (rulesData || [])
      .filter((r) => r.coupon_id)
      .map((r) => r.coupon_id as string)
  )];
  const couponTemplatesMap = new Map<string, CouponTemplate>();
  if (couponIds.length > 0) {
    const { data: couponData } = await admin
      .from('coupons')
      .select('*, coupon_rewards(*)')
      .in('id', couponIds);
    for (const c of couponData || []) {
      couponTemplatesMap.set(c.id, c);
    }
  }

  // Pre-load feature flag for review-link templates
  const reviewFlagEnabled = await isFeatureEnabled(FEATURE_FLAGS.GOOGLE_REVIEW_REQUESTS);

  // Pre-load business info + review URLs from business_settings
  const businessInfo = await getBusinessInfo();
  const { data: bizSettings } = await admin
    .from('business_settings')
    .select('key, value')
    .in('key', ['google_review_url', 'yelp_review_url', 'business_name', 'loyalty_redeem_rate']);

  const settingsMap: Record<string, string> = {};
  for (const s of bizSettings || []) {
    // business_settings stores JSONB — unwrap string values
    const raw = typeof s.value === 'string' ? s.value : String(s.value ?? '');
    settingsMap[s.key] = raw;
  }

  const businessName = settingsMap.business_name || BUSINESS_DEFAULTS.name;
  const loyaltyRedeemRate = parseFloat(settingsMap.loyalty_redeem_rate || '0.01');

  // Shorten review URLs once (reuse across all executions)
  const googleUrl = settingsMap.google_review_url || '';
  const yelpUrl = settingsMap.yelp_review_url || '';
  let shortGoogleUrl = '';
  let shortYelpUrl = '';

  if (googleUrl) {
    try { shortGoogleUrl = await createShortLink(googleUrl); }
    catch { shortGoogleUrl = googleUrl; }
  }
  if (yelpUrl) {
    try { shortYelpUrl = await createShortLink(yelpUrl); }
    catch { shortYelpUrl = yelpUrl; }
  }

  for (const exec of executions) {
    try {
      const rule = rulesMap.get(exec.lifecycle_rule_id);

      // Rule deleted or deactivated since scheduling
      if (!rule || !rule.is_active) {
        await markExecution(admin, exec.id, 'skipped', 'Rule deactivated or deleted');
        skipped++;
        continue;
      }

      // Check feature flag for review-link templates
      const template = rule.sms_template || '';
      const usesReviewLink =
        template.includes('{google_review_link}') || template.includes('{yelp_review_link}');
      if (usesReviewLink && !reviewFlagEnabled) {
        await markExecution(admin, exec.id, 'skipped', 'Google review requests feature disabled');
        skipped++;
        continue;
      }

      // Load customer (includes loyalty/visit fields for template variables)
      const { data: customer } = await admin
        .from('customers')
        .select('first_name, last_name, phone, email, sms_consent, email_consent, loyalty_points_balance, visit_count, last_visit_date, lifetime_spend')
        .eq('id', exec.customer_id)
        .single();

      const canSms = customer?.phone && customer.sms_consent && smsMarketingEnabled;
      const canEmail = customer?.email && customer.email_consent && emailMarketingEnabled;

      if (!canSms && !canEmail) {
        await markExecution(admin, exec.id, 'skipped', 'No contactable channel (no phone/email or consent revoked)');
        skipped++;
        continue;
      }

      // Resolve context: vehicle + service/item names + appointment date/time + amount
      let vehicleDescription = '';
      let serviceName = '';
      let serviceSlug = '';
      let appointmentDate = '';
      let appointmentTime = '';
      let amountPaid = '';

      if (exec.appointment_id) {
        const { data: apt } = await admin
          .from('appointments')
          .select('vehicle_id, scheduled_date, scheduled_start_time, payment_amount')
          .eq('id', exec.appointment_id)
          .single();

        if (apt?.vehicle_id) {
          const { data: vehicle } = await admin
            .from('vehicles')
            .select('year, make, model')
            .eq('id', apt.vehicle_id)
            .single();
          if (vehicle) {
            vehicleDescription = cleanVehicleDescription({ year: vehicle.year, make: vehicle.make, model: vehicle.model });
          }
        }

        // Format appointment date/time in PST
        if (apt?.scheduled_date) {
          try {
            const d = new Date(apt.scheduled_date + 'T00:00:00');
            appointmentDate = d.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              timeZone: 'America/Los_Angeles',
            });
          } catch { /* keep empty */ }
        }
        if (apt?.scheduled_start_time) {
          try {
            // scheduled_start_time is a time string like "14:30"
            const [h, m] = apt.scheduled_start_time.split(':').map(Number);
            const period = h >= 12 ? 'PM' : 'AM';
            const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
            appointmentTime = `${hour12}:${String(m).padStart(2, '0')} ${period}`;
          } catch { /* keep empty */ }
        }
        if (apt?.payment_amount) {
          amountPaid = formatDollar(Number(apt.payment_amount));
        }

        const { data: aptServices } = await admin
          .from('appointment_services')
          .select('services(name, slug)')
          .eq('appointment_id', exec.appointment_id);

        if (aptServices?.length) {
          const svcData = aptServices.map((s) => s.services as unknown as { name: string; slug: string } | null).filter(Boolean);
          serviceName = svcData.map((s) => s!.name).filter(Boolean).join(', ');
          serviceSlug = svcData[0]?.slug ?? '';
        }
      } else if (exec.transaction_id) {
        const { data: tx } = await admin
          .from('transactions')
          .select('vehicle_id, total_amount')
          .eq('id', exec.transaction_id)
          .single();

        if (tx?.vehicle_id) {
          const { data: vehicle } = await admin
            .from('vehicles')
            .select('year, make, model')
            .eq('id', tx.vehicle_id)
            .single();
          if (vehicle) {
            vehicleDescription = cleanVehicleDescription({ year: vehicle.year, make: vehicle.make, model: vehicle.model });
          }
        }

        if (tx?.total_amount) {
          amountPaid = formatDollar(Number(tx.total_amount));
        }

        const { data: txItems } = await admin
          .from('transaction_items')
          .select('item_name')
          .eq('transaction_id', exec.transaction_id)
          .limit(5);

        if (txItems?.length) {
          serviceName = txItems.map((i) => i.item_name).filter(Boolean).join(', ');
        }
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      // Generate unique coupon code if rule has a coupon attached
      let couponCode = '';
      const couponTemplate = rule.coupon_id
        ? couponTemplatesMap.get(rule.coupon_id as string)
        : null;

      if (couponTemplate) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        for (let i = 0; i < 8; i++) {
          couponCode += chars[Math.floor(Math.random() * chars.length)];
        }

        // Create unique single-use coupon for this customer
        const { data: newCoupon } = await admin.from('coupons').insert({
          code: couponCode,
          name: couponTemplate.name,
          auto_apply: false,
          min_purchase: couponTemplate.min_purchase,
          is_single_use: true,
          max_uses: 1,
          expires_at: couponTemplate.expires_at,
          customer_id: exec.customer_id,
          status: 'active',
        }).select().single();

        // Clone rewards from template coupon
        if (newCoupon && couponTemplate.coupon_rewards) {
          const rewards = couponTemplate.coupon_rewards.map((r) => ({
            coupon_id: newCoupon.id,
            applies_to: r.applies_to,
            discount_type: r.discount_type,
            discount_value: r.discount_value,
            max_discount: r.max_discount,
            target_product_id: r.target_product_id,
            target_service_id: r.target_service_id,
            target_product_category_id: r.target_product_category_id,
            target_service_category_id: r.target_service_category_id,
          }));
          await admin.from('coupon_rewards').insert(rewards);
        }
      }

      // Look up product slug from coupon template for smart offer routing
      let couponProductSlug: string | null = null;
      let couponProductCategorySlug: string | null = null;
      if (couponTemplate) {
        const rewards = couponTemplate.coupon_rewards;
        const targetProductId = rewards?.[0]?.target_product_id;
        if (targetProductId) {
          const { data: prod } = await admin
            .from('products').select('slug, product_categories(slug)').eq('id', targetProductId).single();
          couponProductSlug = prod?.slug ?? null;
          couponProductCategorySlug = (prod?.product_categories as unknown as { slug: string } | null)?.slug ?? null;
        }
      }

      // Build personalized booking link with customer info pre-filled
      const bookUrlParams = new URLSearchParams();
      const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
      if (fullName) bookUrlParams.set('name', fullName);
      if (customer.phone) bookUrlParams.set('phone', customer.phone);
      if (couponCode) bookUrlParams.set('coupon', couponCode);
      const bookUrl = `${appUrl}/book${bookUrlParams.toString() ? '?' + bookUrlParams.toString() : ''}`;

      // Build smart offer link: product-targeted coupon → /products, otherwise → /book
      let offerUrl: string;
      if (couponProductSlug && couponProductCategorySlug) {
        const offerParams = new URLSearchParams();
        if (couponCode) offerParams.set('coupon', couponCode);
        offerUrl = `${appUrl}/products/${couponProductCategorySlug}/${couponProductSlug}${offerParams.toString() ? '?' + offerParams.toString() : ''}`;
      } else {
        const offerParams = new URLSearchParams();
        if (serviceSlug) offerParams.set('service', serviceSlug);
        if (couponCode) offerParams.set('coupon', couponCode);
        if (customer.email) offerParams.set('email', customer.email);
        offerUrl = `${appUrl}/book${offerParams.toString() ? '?' + offerParams.toString() : ''}`;
      }

      // Calculate customer-specific template variables
      const loyaltyPts = customer.loyalty_points_balance ?? 0;
      const visitCt = customer.visit_count ?? 0;
      const lifetimeAmt = Number(customer.lifetime_spend ?? 0);
      let daysSinceLastVisit = 'a while';
      if (customer.last_visit_date) {
        const diff = Math.floor((Date.now() - new Date(customer.last_visit_date).getTime()) / (1000 * 60 * 60 * 24));
        daysSinceLastVisit = String(diff);
      }

      // Session RPB-1: resolve assigned detailer's first name for the
      // {detailer_first_name} token (used by the seeded "Google & Yelp Review
      // Request — After Service" template body). job_id is populated for
      // service-completion executions by scheduleFromCompletedJobs (RFB-1).
      // Product-only after_transaction executions have no job_id → fallback
      // "We" reads naturally in review prose ("We had a great time...").
      let detailerFirstName = 'We';
      if (exec.job_id) {
        const { data: jobRow } = await admin
          .from('jobs')
          .select('assigned_staff:employees!jobs_assigned_staff_id_fkey(first_name)')
          .eq('id', exec.job_id)
          .single();
        // Supabase typed-select infers nested FK as array in some shapes;
        // coerce through unknown matches the precedent at L633 for `services`.
        const staff = jobRow?.assigned_staff as unknown as { first_name: string } | null;
        if (staff?.first_name) detailerFirstName = staff.first_name;
      }

      // Session RPB-1: unified fallback for vehicle_info AND new alias
      // vehicle_description. Prior empty-string behavior produced equally
      // broken prose ("...working on your . today") for vehicle-less
      // customers; "vehicle" reads naturally in the same slot.
      const vehicleDisplay = vehicleDescription || 'vehicle';

      // Build template variables
      const templateVars: Record<string, string> = {
        first_name: customer.first_name || 'there',
        last_name: customer.last_name || '',
        service_name: serviceName || 'your service',
        vehicle_info: vehicleDisplay,
        vehicle_description: vehicleDisplay, // RPB-1: alias of vehicle_info
        detailer_first_name: detailerFirstName, // RPB-1: 'We' fallback when no job/detailer
        business_name: businessName,
        business_phone: formatPhone(businessInfo.phone),
        business_address: businessInfo.address,
        google_review_link: shortGoogleUrl,
        yelp_review_link: shortYelpUrl,
        coupon_code: couponCode,
        booking_url: `${appUrl}/book`,
        book_url: bookUrl,
        offer_url: offerUrl,
        book_now_url: offerUrl, // backward compat
        loyalty_points: formatNumber(loyaltyPts),
        loyalty_value: formatDollar(loyaltyPts * loyaltyRedeemRate),
        visit_count: formatNumber(visitCt),
        days_since_last_visit: daysSinceLastVisit,
        lifetime_spend: formatDollar(lifetimeAmt),
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        amount_paid: amountPaid,
      };

      const ruleAction = (rule.action as string) || 'sms';
      let smsSent = false;
      let emailSent = false;

      // Send SMS if rule action includes SMS
      if ((ruleAction === 'sms' || ruleAction === 'both') && canSms && template) {
        let message = renderTemplate(template, templateVars);
        message = cleanEmptyReviewLines(message);

        const result = await sendMarketingSms(customer.phone!, message, exec.customer_id, {
          lifecycleExecutionId: exec.id,
          source: 'lifecycle',
        });
        smsSent = result.success;
      }

      // Send email if rule action includes email
      if ((ruleAction === 'email' || ruleAction === 'both') && canEmail) {
        const emailTemplateId = rule.email_template_id as string | null;

        if (emailTemplateId) {
          // Use the template system: resolve template → render → send
          const emailResult = await sendTemplatedEmail(
            customer.email!,
            `lifecycle_${rule.id}`,
            templateVars,
            {
              isMarketing: true,
              tracking: true,
              mailgunVars: { lifecycle_execution_id: exec.id },
            }
          );

          // If template system didn't find a match by trigger key, try direct template fetch
          if (!emailResult.usedTemplate && emailTemplateId) {
            const { renderFromBlocks } = await import('@/lib/email/send-templated-email');
            const { data: tmpl } = await admin
              .from('email_templates')
              .select('*, email_layouts(*)')
              .eq('id', emailTemplateId)
              .single();

            if (tmpl?.body_blocks && Array.isArray(tmpl.body_blocks)) {
              const layoutSlug = (tmpl.email_layouts as { slug: string } | null)?.slug || 'default';
              const rendered = await renderFromBlocks(
                tmpl.body_blocks as EmailBlock[],
                layoutSlug,
                templateVars,
                { isMarketing: true }
              );
              if (rendered) {
                const subject = renderTemplate(tmpl.subject || rule.email_subject || '', templateVars);
                const result = await sendEmail(customer.email!, subject, rendered.text, rendered.html, {
                  variables: { lifecycle_execution_id: exec.id },
                  tracking: true,
                });
                emailSent = result.success;
              }
            }
          } else {
            emailSent = emailResult.success;
          }
        } else if (rule.email_template && rule.email_subject) {
          // Legacy: plain-text email body from lifecycle rule
          const emailSubject = renderTemplate(rule.email_subject as string, templateVars);
          const emailBody = cleanEmptyReviewLines(renderTemplate(rule.email_template as string, templateVars));
          const bodyParagraphs = emailBody.split('\n').map((p: string) => `<p>${p}</p>`).join('');
          const emailHtml = `<html><body>${bodyParagraphs}</body></html>`;
          const result = await sendEmail(customer.email!, emailSubject, emailBody, emailHtml, {
            variables: { lifecycle_execution_id: exec.id },
            tracking: true,
          });
          emailSent = result.success;
        }
      }

      const anySent = smsSent || emailSent;
      if (anySent) {
        await markExecution(admin, exec.id, 'sent');
        sent++;
      } else {
        await markExecution(admin, exec.id, 'failed', 'No channel delivered successfully');
        failed++;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Lifecycle execution ${exec.id} failed:`, err);
      try { await markExecution(admin, exec.id, 'failed', errorMsg); } catch { /* noop */ }
      failed++;
    }
  }

  return { sent, failed, skipped };
}

// ===========================================================================
// Helpers
// ===========================================================================

async function markExecution(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  status: 'sent' | 'failed' | 'skipped',
  errorMessage?: string
) {
  const update: Record<string, unknown> = { status };
  if (status === 'sent' || status === 'failed') {
    update.executed_at = new Date().toISOString();
  }
  if (errorMessage) {
    update.error_message = errorMessage;
  }

  await admin.from('lifecycle_executions').update(update).eq('id', id);
}
