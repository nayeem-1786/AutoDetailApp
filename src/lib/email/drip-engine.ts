// Drip Campaign Engine — enrollment, execution, stop conditions, auto-enrollment
// Called by lifecycle engine cron (Phases 0, 0.5, 3)

import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/utils/email';
import { sendMarketingSms } from '@/lib/utils/sms';
import { renderTemplate, cleanEmptyReviewLines, formatPhoneDisplay, formatDollar, formatNumber } from '@/lib/utils/template';
import { getBusinessInfo } from '@/lib/data/business';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { renderFromBlocks } from './send-templated-email';
import type { DripStopConditions, DripStep } from './types';

type AdminClient = ReturnType<typeof createAdminClient>;

// ─── Enrollment ──────────────────────────────────────────────────────

/**
 * Enroll a customer in a drip sequence.
 * Returns enrollment or null if already enrolled / sequence inactive / no steps.
 */
export async function enrollCustomer(
  sequenceId: string,
  customerId: string,
  admin?: AdminClient
): Promise<{ id: string; next_send_at: string | null } | null> {
  const db = admin ?? createAdminClient();

  // Check sequence is active
  const { data: seq } = await db
    .from('drip_sequences')
    .select('id, is_active')
    .eq('id', sequenceId)
    .single();

  if (!seq?.is_active) return null;

  // Get first step to calculate next_send_at
  const { data: steps } = await db
    .from('drip_steps')
    .select('delay_days, delay_hours')
    .eq('sequence_id', sequenceId)
    .eq('is_active', true)
    .order('step_order', { ascending: true })
    .limit(1);

  if (!steps?.length) return null;

  const step0 = steps[0];
  const delayMs = (step0.delay_days * 24 * 60 + (step0.delay_hours || 0) * 60) * 60 * 1000;
  const nextSendAt = new Date(Date.now() + delayMs).toISOString();

  try {
    const { data: enrollment, error } = await db
      .from('drip_enrollments')
      .insert({
        sequence_id: sequenceId,
        customer_id: customerId,
        current_step: 0,
        next_send_at: nextSendAt,
        status: 'active',
      })
      .select('id, next_send_at')
      .single();

    if (error) {
      // UNIQUE constraint violation — already enrolled
      if (error.code === '23505') return null;
      console.error('[Drip] Enrollment failed:', error);
      return null;
    }

    return enrollment;
  } catch (err) {
    console.error('[Drip] Enrollment error:', err);
    return null;
  }
}

// ─── Stop Condition Checks ───────────────────────────────────────────

interface EnrollmentRef {
  id: string;
  customer_id: string;
  sequence_id: string;
  enrolled_at: string;
}

/**
 * Check sequence-level stop conditions against customer activity since enrollment.
 */
export async function checkStopConditions(
  enrollment: EnrollmentRef,
  stopConditions: DripStopConditions,
  admin?: AdminClient
): Promise<{ shouldStop: boolean; reason: string | null }> {
  const db = admin ?? createAdminClient();

  // on_purchase: customer completed a transaction since enrolled_at
  if (stopConditions.on_purchase) {
    const { count } = await db
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', enrollment.customer_id)
      .eq('status', 'completed')
      .gte('transaction_date', enrollment.enrolled_at);

    if (count && count > 0) {
      return { shouldStop: true, reason: 'purchased' };
    }
  }

  // on_booking: customer booked an appointment since enrolled_at
  if (stopConditions.on_booking) {
    const { count } = await db
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', enrollment.customer_id)
      .in('status', ['pending', 'confirmed', 'completed'])
      .gte('created_at', enrollment.enrolled_at);

    if (count && count > 0) {
      return { shouldStop: true, reason: 'booked' };
    }
  }

  // on_reply: customer sent an inbound SMS since enrolled_at
  if (stopConditions.on_reply) {
    // Two-step query (Supabase .or() on related tables doesn't work)
    const { data: convos } = await db
      .from('conversations')
      .select('id')
      .eq('customer_id', enrollment.customer_id);

    if (convos?.length) {
      const convoIds = convos.map((c) => c.id);
      const { count } = await db
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .in('conversation_id', convoIds)
        .eq('direction', 'inbound')
        .eq('sender_type', 'customer')
        .gte('created_at', enrollment.enrolled_at);

      if (count && count > 0) {
        return { shouldStop: true, reason: 'replied' };
      }
    }
  }

  return { shouldStop: false, reason: null };
}

/**
 * Check per-step exit condition.
 */
export async function checkExitCondition(
  enrollment: EnrollmentRef,
  step: DripStep,
  admin?: AdminClient
): Promise<{ shouldExit: boolean }> {
  if (!step.exit_condition) return { shouldExit: false };

  const db = admin ?? createAdminClient();

  if (step.exit_condition === 'has_transaction') {
    const { count } = await db
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', enrollment.customer_id)
      .eq('status', 'completed')
      .gte('transaction_date', enrollment.enrolled_at);

    return { shouldExit: (count ?? 0) > 0 };
  }

  if (step.exit_condition === 'has_appointment') {
    const { count } = await db
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', enrollment.customer_id)
      .in('status', ['pending', 'confirmed', 'completed'])
      .gte('created_at', enrollment.enrolled_at);

    return { shouldExit: (count ?? 0) > 0 };
  }

  // opened_email and clicked_link require Mailgun webhook integration (TODO)
  if (step.exit_condition === 'opened_email' || step.exit_condition === 'clicked_link') {
    console.log(`[Drip] ${step.exit_condition} exit condition not yet implemented (requires Mailgun webhooks)`);
    return { shouldExit: false };
  }

  return { shouldExit: false };
}

/**
 * Execute exit action: stop, move to another sequence, or tag.
 */
export async function executeExitAction(
  enrollment: EnrollmentRef,
  step: DripStep,
  reason: string,
  admin?: AdminClient
): Promise<void> {
  const db = admin ?? createAdminClient();

  // Stop the current enrollment
  await db
    .from('drip_enrollments')
    .update({
      status: 'stopped',
      stopped_reason: reason,
      stopped_at: new Date().toISOString(),
    })
    .eq('id', enrollment.id);

  const action = step.exit_action;

  if (action === 'move' && step.exit_sequence_id) {
    await enrollCustomer(step.exit_sequence_id, enrollment.customer_id, db);
  } else if (action === 'tag') {
    console.warn('[Drip] tag exit action skipped — customer tags not implemented');
  }
  // action === 'stop' or null → already stopped above
}

// ─── Step Execution ──────────────────────────────────────────────────

interface FullEnrollment {
  id: string;
  sequence_id: string;
  customer_id: string;
  current_step: number;
  enrolled_at: string;
  status: string;
}

/**
 * Execute a single drip step: send email/SMS, generate coupon, log, advance.
 */
export async function executeStep(
  enrollment: FullEnrollment,
  step: DripStep,
  admin?: AdminClient
): Promise<{ sent: boolean; emailSent: boolean; smsSent: boolean }> {
  const db = admin ?? createAdminClient();

  // Check feature flags
  const [smsEnabled, emailEnabled] = await Promise.all([
    isFeatureEnabled(FEATURE_FLAGS.SMS_MARKETING),
    isFeatureEnabled(FEATURE_FLAGS.EMAIL_MARKETING),
  ]);

  // Load customer
  const { data: customer } = await db
    .from('customers')
    .select('first_name, last_name, phone, email, sms_consent, email_consent, loyalty_points_balance, visit_count, last_visit_date, lifetime_spend')
    .eq('id', enrollment.customer_id)
    .single();

  if (!customer) {
    console.error(`[Drip] Customer ${enrollment.customer_id} not found`);
    await logSend(db, enrollment.id, step.id, step.step_order, 'email', 'failed', null, null, 'Customer not found');
    return { sent: false, emailSent: false, smsSent: false };
  }

  const canSms = customer.phone && customer.sms_consent && smsEnabled;
  const canEmail = customer.email && customer.email_consent && emailEnabled;

  if (!canSms && !canEmail) {
    await logSend(db, enrollment.id, step.id, step.step_order, step.channel, 'skipped', null, null, 'No contactable channel');
    await advanceEnrollment(db, enrollment, step);
    return { sent: false, emailSent: false, smsSent: false };
  }

  // Load business info for template variables
  const businessInfo = await getBusinessInfo();
  const { data: bizSettings } = await db
    .from('business_settings')
    .select('key, value')
    .in('key', ['business_name', 'loyalty_redeem_rate']);

  const settingsMap: Record<string, string> = {};
  for (const s of bizSettings || []) {
    settingsMap[s.key] = typeof s.value === 'string' ? s.value : String(s.value ?? '');
  }
  const businessName = settingsMap.business_name || 'Smart Detail Auto Spa & Supplies';
  const loyaltyRedeemRate = parseFloat(settingsMap.loyalty_redeem_rate || '0.01');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Generate coupon if step has coupon_id
  let couponCode = '';
  if (step.coupon_id) {
    couponCode = await generateCoupon(db, step.coupon_id, enrollment.customer_id);
  }

  // Build template variables (same pattern as lifecycle engine)
  const loyaltyPts = customer.loyalty_points_balance ?? 0;
  const visitCt = customer.visit_count ?? 0;
  const lifetimeAmt = Number(customer.lifetime_spend ?? 0);
  let daysSinceLastVisit = 'a while';
  if (customer.last_visit_date) {
    const diff = Math.floor((Date.now() - new Date(customer.last_visit_date).getTime()) / (1000 * 60 * 60 * 24));
    daysSinceLastVisit = String(diff);
  }

  const bookUrlParams = new URLSearchParams();
  const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  if (fullName) bookUrlParams.set('name', fullName);
  if (customer.phone) bookUrlParams.set('phone', customer.phone);
  if (couponCode) bookUrlParams.set('coupon', couponCode);
  const bookUrl = `${appUrl}/book${bookUrlParams.toString() ? '?' + bookUrlParams.toString() : ''}`;

  const templateVars: Record<string, string> = {
    first_name: customer.first_name || 'there',
    last_name: customer.last_name || '',
    business_name: businessName,
    business_phone: formatPhoneDisplay(businessInfo.phone),
    business_address: businessInfo.address,
    coupon_code: couponCode,
    booking_url: `${appUrl}/book`,
    book_url: bookUrl,
    offer_url: bookUrl,
    loyalty_points: formatNumber(loyaltyPts),
    loyalty_value: formatDollar(loyaltyPts * loyaltyRedeemRate),
    visit_count: formatNumber(visitCt),
    days_since_last_visit: daysSinceLastVisit,
    lifetime_spend: formatDollar(lifetimeAmt),
  };

  let emailSent = false;
  let smsSent = false;

  // Send email
  if ((step.channel === 'email' || step.channel === 'both') && canEmail) {
    emailSent = await sendDripEmail(db, enrollment, step, customer.email!, templateVars, couponCode);
  }

  // Send SMS
  if ((step.channel === 'sms' || step.channel === 'both') && canSms) {
    smsSent = await sendDripSms(enrollment, step, customer.phone!, templateVars);
  }

  const anySent = emailSent || smsSent;

  // Advance to next step
  await advanceEnrollment(db, enrollment, step);

  return { sent: anySent, emailSent, smsSent };
}

async function sendDripEmail(
  db: AdminClient,
  enrollment: FullEnrollment,
  step: DripStep,
  email: string,
  vars: Record<string, string>,
  couponCode: string
): Promise<boolean> {
  try {
    if (step.template_id) {
      // Load template with layout
      const { data: tmpl } = await db
        .from('email_templates')
        .select('*, email_layouts(*)')
        .eq('id', step.template_id)
        .single();

      if (tmpl?.body_blocks && Array.isArray(tmpl.body_blocks)) {
        const layoutSlug = (tmpl.email_layouts as Record<string, unknown>)?.slug as string || 'standard';
        const rendered = await renderFromBlocks(
          tmpl.body_blocks as any,
          layoutSlug,
          vars,
          { isMarketing: true }
        );

        if (rendered) {
          const subject = renderTemplate(step.subject_override || tmpl.subject || '', vars);
          const result = await sendEmail(email, subject, rendered.text, rendered.html, {
            variables: {
              drip_enrollment_id: enrollment.id,
              drip_step_id: step.id,
            },
            tracking: true,
          });

          await logSend(db, enrollment.id, step.id, step.step_order, 'email',
            result.success ? 'sent' : 'failed',
            result.success ? (result as any).id : null,
            couponCode || null,
            result.success ? null : (result as any).error
          );

          return result.success;
        }
      }
    }

    // No template — skip email
    await logSend(db, enrollment.id, step.id, step.step_order, 'email', 'skipped', null, null, 'No template configured');
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Drip] Email send failed for enrollment ${enrollment.id}:`, err);
    await logSend(db, enrollment.id, step.id, step.step_order, 'email', 'failed', null, null, msg);
    return false;
  }
}

async function sendDripSms(
  enrollment: FullEnrollment,
  step: DripStep,
  phone: string,
  vars: Record<string, string>
): Promise<boolean> {
  if (!step.sms_template) return false;

  try {
    let message = renderTemplate(step.sms_template, vars);
    message = cleanEmptyReviewLines(message);

    const result = await sendMarketingSms(phone, message, enrollment.customer_id, {
      source: 'lifecycle',
    });

    return result.success;
  } catch (err) {
    console.error(`[Drip] SMS send failed for enrollment ${enrollment.id}:`, err);
    return false;
  }
}

// ─── Coupon Generation ───────────────────────────────────────────────

async function generateCoupon(
  db: AdminClient,
  couponTemplateId: string,
  customerId: string
): Promise<string> {
  const { data: template } = await db
    .from('coupons')
    .select('*, coupon_rewards(*)')
    .eq('id', couponTemplateId)
    .single();

  if (!template) return '';

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  const { data: newCoupon } = await db.from('coupons').insert({
    code,
    name: template.name,
    auto_apply: false,
    min_purchase: template.min_purchase,
    is_single_use: true,
    max_uses: 1,
    expires_at: template.expires_at,
    customer_id: customerId,
    status: 'active',
  }).select().single();

  if (newCoupon && template.coupon_rewards) {
    const rewards = (template.coupon_rewards as any[]).map((r) => ({
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
    await db.from('coupon_rewards').insert(rewards);
  }

  return code;
}

// ─── Enrollment Advancement ──────────────────────────────────────────

async function advanceEnrollment(
  db: AdminClient,
  enrollment: FullEnrollment,
  currentStep: DripStep
): Promise<void> {
  const nextStepOrder = enrollment.current_step + 1;

  // Check if there's a next step
  const { data: nextStep } = await db
    .from('drip_steps')
    .select('delay_days, delay_hours')
    .eq('sequence_id', enrollment.sequence_id)
    .eq('step_order', nextStepOrder)
    .eq('is_active', true)
    .single();

  if (nextStep) {
    // Calculate next_send_at from now
    const delayMs = (nextStep.delay_days * 24 * 60 + (nextStep.delay_hours || 0) * 60) * 60 * 1000;
    const nextSendAt = new Date(Date.now() + delayMs).toISOString();

    await db
      .from('drip_enrollments')
      .update({
        current_step: nextStepOrder,
        next_send_at: nextSendAt,
      })
      .eq('id', enrollment.id);
  } else {
    // No more steps — mark completed
    await db
      .from('drip_enrollments')
      .update({
        current_step: nextStepOrder,
        status: 'completed',
        next_send_at: null,
      })
      .eq('id', enrollment.id);
  }
}

// ─── Send Log Helper ─────────────────────────────────────────────────

async function logSend(
  db: AdminClient,
  enrollmentId: string,
  stepId: string,
  stepOrder: number,
  channel: string,
  status: 'sent' | 'failed' | 'skipped',
  mailgunMessageId: string | null,
  couponCode: string | null,
  errorMessage: string | null
): Promise<void> {
  await db.from('drip_send_log').insert({
    enrollment_id: enrollmentId,
    step_id: stepId,
    step_order: stepOrder,
    channel,
    status,
    mailgun_message_id: mailgunMessageId,
    coupon_code: couponCode,
    error_message: errorMessage,
  });
}

// ─── Phase 3: Process Pending Enrollments ────────────────────────────

/**
 * Execute all active drip enrollments whose next_send_at has passed.
 * Called by lifecycle engine Phase 3.
 */
export async function processEnrollments(
  admin?: AdminClient
): Promise<{ processed: number; sent: number; stopped: number; failed: number }> {
  const db = admin ?? createAdminClient();
  const now = new Date().toISOString();

  let processed = 0;
  let sent = 0;
  let stopped = 0;
  let failed = 0;

  // Get active enrollments ready to execute
  const { data: enrollments, error } = await db
    .from('drip_enrollments')
    .select('id, sequence_id, customer_id, current_step, enrolled_at, status')
    .eq('status', 'active')
    .lte('next_send_at', now)
    .order('next_send_at', { ascending: true })
    .limit(100);

  if (error || !enrollments?.length) {
    if (error) console.error('[Drip] Failed to load pending enrollments:', error);
    return { processed, sent, stopped, failed };
  }

  // Pre-load sequences with steps
  const sequenceIds = [...new Set(enrollments.map((e) => e.sequence_id))];
  const { data: sequences } = await db
    .from('drip_sequences')
    .select('id, stop_conditions, nurture_sequence_id, is_active')
    .in('id', sequenceIds);

  const seqMap = new Map((sequences || []).map((s) => [s.id, s]));

  // Pre-load all steps for these sequences
  const { data: allSteps } = await db
    .from('drip_steps')
    .select('*')
    .in('sequence_id', sequenceIds)
    .eq('is_active', true)
    .order('step_order', { ascending: true });

  // Group steps by sequence
  const stepsMap = new Map<string, DripStep[]>();
  for (const step of (allSteps || []) as DripStep[]) {
    const existing = stepsMap.get(step.sequence_id) || [];
    existing.push(step);
    stepsMap.set(step.sequence_id, existing);
  }

  for (const enrollment of enrollments) {
    processed++;

    try {
      const seq = seqMap.get(enrollment.sequence_id);
      if (!seq || !seq.is_active) {
        // Sequence deactivated — skip but don't stop enrollment
        continue;
      }

      const steps = stepsMap.get(enrollment.sequence_id) || [];
      const currentStep = steps.find((s) => s.step_order === enrollment.current_step);

      if (!currentStep) {
        // No valid step — mark completed
        await db.from('drip_enrollments')
          .update({ status: 'completed', next_send_at: null })
          .eq('id', enrollment.id);
        continue;
      }

      // Check per-step exit condition
      const exitResult = await checkExitCondition(
        { id: enrollment.id, customer_id: enrollment.customer_id, sequence_id: enrollment.sequence_id, enrolled_at: enrollment.enrolled_at },
        currentStep,
        db
      );

      if (exitResult.shouldExit) {
        await executeExitAction(
          { id: enrollment.id, customer_id: enrollment.customer_id, sequence_id: enrollment.sequence_id, enrolled_at: enrollment.enrolled_at },
          currentStep,
          currentStep.exit_condition || 'exit_condition_met',
          db
        );
        stopped++;
        continue;
      }

      // Execute step
      const result = await executeStep(enrollment as FullEnrollment, currentStep, db);

      if (result.sent) {
        sent++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`[Drip] Failed to process enrollment ${enrollment.id}:`, err);
      failed++;
    }
  }

  return { processed, sent, stopped, failed };
}

// ─── Phase 0: Auto-Enrollment ────────────────────────────────────────

/**
 * Check each active drip sequence's trigger condition and enroll matching customers.
 * Skips 'manual_enroll' and 'tag_added' triggers.
 * Called by lifecycle engine Phase 0.
 */
export async function runAutoEnrollments(
  admin?: AdminClient
): Promise<number> {
  const db = admin ?? createAdminClient();
  let totalEnrolled = 0;

  const { data: sequences } = await db
    .from('drip_sequences')
    .select('id, trigger_condition, trigger_value, audience_filters')
    .eq('is_active', true);

  if (!sequences?.length) return 0;

  for (const seq of sequences) {
    try {
      const condition = seq.trigger_condition as string;

      // Skip triggers that don't auto-enroll
      if (condition === 'manual_enroll' || condition === 'tag_added') continue;

      let customerIds: string[] = [];

      if (condition === 'no_visit_days') {
        const days = (seq.trigger_value as any)?.days;
        if (!days || typeof days !== 'number') continue;

        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // Find customers whose last_visit_date is older than cutoff
        // and who have some contact method
        const { data: customers } = await db
          .from('customers')
          .select('id')
          .lt('last_visit_date', cutoffDate)
          .not('last_visit_date', 'is', null);

        customerIds = (customers || []).map((c) => c.id);
      } else if (condition === 'after_service') {
        const serviceId = (seq.trigger_value as any)?.service_id;
        if (!serviceId) continue;

        // Find customers with completed appointments in last 24h matching service
        const lookback = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: aptServices } = await db
          .from('appointment_services')
          .select('appointments!inner(customer_id, status, updated_at)')
          .eq('service_id', serviceId);

        const matchingCustomerIds = (aptServices || [])
          .filter((as: any) => {
            const apt = as.appointments;
            return apt?.status === 'completed' && apt.updated_at >= lookback && apt.customer_id;
          })
          .map((as: any) => as.appointments.customer_id as string);

        customerIds = [...new Set(matchingCustomerIds)];
      } else if (condition === 'new_customer') {
        const days = (seq.trigger_value as any)?.days || 7;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data: customers } = await db
          .from('customers')
          .select('id')
          .gte('created_at', cutoff);

        customerIds = (customers || []).map((c) => c.id);
      }

      if (customerIds.length === 0) continue;

      // Exclude already-enrolled customers
      const { data: existing } = await db
        .from('drip_enrollments')
        .select('customer_id')
        .eq('sequence_id', seq.id)
        .in('customer_id', customerIds);

      const enrolledSet = new Set((existing || []).map((e) => e.customer_id));
      const toEnroll = customerIds.filter((id) => !enrolledSet.has(id));

      // Verify contactability
      if (toEnroll.length > 0) {
        const { data: contactable } = await db
          .from('customers')
          .select('id, phone, email, sms_consent, email_consent')
          .in('id', toEnroll);

        for (const cust of contactable || []) {
          const hasPhone = cust.phone && cust.sms_consent;
          const hasEmail = cust.email && cust.email_consent;
          if (!hasPhone && !hasEmail) continue;

          const result = await enrollCustomer(seq.id, cust.id, db);
          if (result) totalEnrolled++;
        }
      }
    } catch (err) {
      console.error(`[Drip] Auto-enrollment failed for sequence ${seq.id}:`, err);
    }
  }

  return totalEnrolled;
}

// ─── Phase 0.5: Check All Stop Conditions ────────────────────────────

/**
 * Check stop conditions on all active enrollments.
 * Handles nurture transfer if sequence has nurture_sequence_id.
 * Called by lifecycle engine Phase 0.5.
 */
export async function checkAllStopConditions(
  admin?: AdminClient
): Promise<number> {
  const db = admin ?? createAdminClient();
  let stoppedCount = 0;

  // Load all active enrollments
  const { data: enrollments } = await db
    .from('drip_enrollments')
    .select('id, sequence_id, customer_id, enrolled_at, nurture_transferred')
    .eq('status', 'active')
    .limit(500);

  if (!enrollments?.length) return 0;

  // Pre-load sequences
  const sequenceIds = [...new Set(enrollments.map((e) => e.sequence_id))];
  const { data: sequences } = await db
    .from('drip_sequences')
    .select('id, stop_conditions, nurture_sequence_id')
    .in('id', sequenceIds);

  const seqMap = new Map((sequences || []).map((s) => [s.id, s]));

  for (const enrollment of enrollments) {
    try {
      const seq = seqMap.get(enrollment.sequence_id);
      if (!seq) continue;

      const stopConditions = seq.stop_conditions as DripStopConditions;
      if (!stopConditions) continue;

      const result = await checkStopConditions(
        {
          id: enrollment.id,
          customer_id: enrollment.customer_id,
          sequence_id: enrollment.sequence_id,
          enrolled_at: enrollment.enrolled_at,
        },
        stopConditions,
        db
      );

      if (result.shouldStop) {
        await db.from('drip_enrollments')
          .update({
            status: 'stopped',
            stopped_reason: result.reason,
            stopped_at: new Date().toISOString(),
          })
          .eq('id', enrollment.id);

        // Nurture transfer
        if (seq.nurture_sequence_id && !enrollment.nurture_transferred) {
          const transferResult = await enrollCustomer(seq.nurture_sequence_id, enrollment.customer_id, db);
          if (transferResult) {
            await db.from('drip_enrollments')
              .update({ nurture_transferred: true })
              .eq('id', enrollment.id);
          }
        }

        stoppedCount++;
      }
    } catch (err) {
      console.error(`[Drip] Stop condition check failed for enrollment ${enrollment.id}:`, err);
    }
  }

  return stoppedCount;
}
