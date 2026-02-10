import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMarketingSms } from '@/lib/utils/sms';
import { createShortLink } from '@/lib/utils/short-link';
import { FEATURE_FLAGS } from '@/lib/utils/constants';

/**
 * Lifecycle execution engine cron endpoint.
 *
 * Runs in two phases per invocation:
 * Phase 1 — Schedule: find recent completions and insert pending lifecycle_executions
 * Phase 2 — Execute: send SMS for any executions whose scheduled_for <= now
 *
 * Designed to be called every 5–15 minutes by an external scheduler or Vercel Cron.
 *
 * Example: curl -H "x-api-key: YOUR_KEY" https://domain.com/api/cron/lifecycle-engine
 */
export async function GET(request: NextRequest) {
  // Authenticate via API key
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let scheduled = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  // =========================================================================
  // Phase 1: Schedule new executions
  // =========================================================================

  // Load all active lifecycle rules
  const { data: rules, error: rulesErr } = await admin
    .from('lifecycle_rules')
    .select('*')
    .eq('is_active', true);

  if (rulesErr) {
    console.error('Failed to load lifecycle rules:', rulesErr);
    return NextResponse.json({ error: 'Failed to load rules' }, { status: 500 });
  }

  if (rules && rules.length > 0) {
    const serviceRules = rules.filter((r) => r.trigger_condition === 'after_service');
    const transactionRules = rules.filter((r) => r.trigger_condition === 'after_transaction');

    // ----- Phase 1A: Appointment completions -----
    if (serviceRules.length > 0) {
      scheduled += await scheduleAppointmentRules(admin, serviceRules, twentyFourHoursAgo, thirtyDaysAgo);
    }

    // ----- Phase 1B: Transaction completions -----
    if (transactionRules.length > 0) {
      scheduled += await scheduleTransactionRules(admin, transactionRules, twentyFourHoursAgo, thirtyDaysAgo);
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
    const results = await executePending(admin, pendingExecs);
    sent += results.sent;
    failed += results.failed;
    skipped += results.skipped;
  }

  return NextResponse.json({ scheduled, sent, failed, skipped });
}

// ===========================================================================
// Phase 1A — Schedule from appointment completions
// ===========================================================================

interface LifecycleRule {
  id: string;
  trigger_service_id: string | null;
  delay_days: number;
  delay_minutes: number;
  [key: string]: unknown;
}

async function scheduleAppointmentRules(
  admin: ReturnType<typeof createAdminClient>,
  rules: LifecycleRule[],
  twentyFourHoursAgo: string,
  thirtyDaysAgo: string
): Promise<number> {
  let scheduled = 0;

  // Find recently completed appointments with customer info
  const { data: appointments, error: aptErr } = await admin
    .from('appointments')
    .select(`
      id,
      customer_id,
      vehicle_id,
      updated_at,
      customers!inner(id, phone, sms_consent),
      appointment_services(service_id)
    `)
    .eq('status', 'completed')
    .gte('updated_at', twentyFourHoursAgo)
    .not('customer_id', 'is', null);

  if (aptErr) {
    console.error('Failed to query completed appointments:', aptErr);
    return 0;
  }

  if (!appointments || appointments.length === 0) return 0;

  // Get existing executions for dedup
  const appointmentIds = appointments.map((a) => a.id);
  const ruleIds = rules.map((r) => r.id);

  const { data: existingByAppointment } = await admin
    .from('lifecycle_executions')
    .select('lifecycle_rule_id, appointment_id')
    .in('lifecycle_rule_id', ruleIds)
    .in('appointment_id', appointmentIds);

  const appointmentDedupSet = new Set(
    (existingByAppointment || []).map((e) => `${e.lifecycle_rule_id}:${e.appointment_id}`)
  );

  // Get recent executions for 30-day customer dedup
  const customerIds = [...new Set(appointments.map((a) => a.customer_id).filter(Boolean))] as string[];
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

  for (const apt of appointments) {
    const customer = apt.customers as unknown as { id: string; phone: string | null; sms_consent: boolean };
    if (!customer?.phone || !customer.sms_consent) continue;

    const aptServiceIds = ((apt.appointment_services || []) as Array<{ service_id: string }>).map(
      (s) => s.service_id
    );

    for (const rule of rules) {
      // Skip if already scheduled for this appointment
      if (appointmentDedupSet.has(`${rule.id}:${apt.id}`)) continue;

      // 30-day customer dedup
      if (customerDedupSet.has(`${rule.id}:${apt.customer_id}`)) continue;

      // Service filter: if rule targets a specific service, appointment must include it
      if (rule.trigger_service_id && !aptServiceIds.includes(rule.trigger_service_id)) continue;

      // Calculate scheduled_for
      const delayMs = (rule.delay_days * 1440 + (rule.delay_minutes || 0)) * 60 * 1000;
      const scheduledFor = new Date(new Date(apt.updated_at).getTime() + delayMs).toISOString();

      toInsert.push({
        lifecycle_rule_id: rule.id,
        customer_id: apt.customer_id,
        appointment_id: apt.id,
        trigger_event: 'appointment_completed',
        triggered_at: apt.updated_at,
        scheduled_for: scheduledFor,
        status: 'pending',
      });

      // Mark in dedup sets to avoid dups within same batch
      appointmentDedupSet.add(`${rule.id}:${apt.id}`);
      customerDedupSet.add(`${rule.id}:${apt.customer_id}`);
    }
  }

  if (toInsert.length > 0) {
    // Use upsert with onConflict to handle any race conditions with the unique index
    const { data: inserted, error: insertErr } = await admin
      .from('lifecycle_executions')
      .insert(toInsert)
      .select('id');

    if (insertErr) {
      // Unique constraint violations are expected for races — log but don't fail
      if (insertErr.code === '23505') {
        console.log('Some appointment executions already existed (race condition), skipping duplicates');
      } else {
        console.error('Failed to insert appointment executions:', insertErr);
      }
    }
    scheduled += inserted?.length ?? 0;
  }

  return scheduled;
}

// ===========================================================================
// Phase 1B — Schedule from transaction completions
// ===========================================================================

async function scheduleTransactionRules(
  admin: ReturnType<typeof createAdminClient>,
  rules: LifecycleRule[],
  twentyFourHoursAgo: string,
  thirtyDaysAgo: string
): Promise<number> {
  let scheduled = 0;

  // Find recently completed transactions with customer info
  const { data: transactions, error: txErr } = await admin
    .from('transactions')
    .select(`
      id,
      customer_id,
      vehicle_id,
      transaction_date,
      customers!inner(id, phone, sms_consent),
      transaction_items(service_id)
    `)
    .eq('status', 'completed')
    .gte('transaction_date', twentyFourHoursAgo)
    .not('customer_id', 'is', null);

  if (txErr) {
    console.error('Failed to query completed transactions:', txErr);
    return 0;
  }

  if (!transactions || transactions.length === 0) return 0;

  // Get existing executions for dedup
  const transactionIds = transactions.map((t) => t.id);
  const ruleIds = rules.map((r) => r.id);

  const { data: existingByTx } = await admin
    .from('lifecycle_executions')
    .select('lifecycle_rule_id, transaction_id')
    .in('lifecycle_rule_id', ruleIds)
    .in('transaction_id', transactionIds);

  const txDedupSet = new Set(
    (existingByTx || []).map((e) => `${e.lifecycle_rule_id}:${e.transaction_id}`)
  );

  // Get recent executions for 30-day customer dedup
  const customerIds = [...new Set(transactions.map((t) => t.customer_id).filter(Boolean))] as string[];
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

  for (const tx of transactions) {
    const customer = tx.customers as unknown as { id: string; phone: string | null; sms_consent: boolean };
    if (!customer?.phone || !customer.sms_consent) continue;

    const txServiceIds = ((tx.transaction_items || []) as Array<{ service_id: string | null }>)
      .map((i) => i.service_id)
      .filter(Boolean) as string[];

    for (const rule of rules) {
      // Skip if already scheduled for this transaction
      if (txDedupSet.has(`${rule.id}:${tx.id}`)) continue;

      // 30-day customer dedup
      if (customerDedupSet.has(`${rule.id}:${tx.customer_id}`)) continue;

      // Service filter: if rule targets a specific service, transaction must include it
      if (rule.trigger_service_id && !txServiceIds.includes(rule.trigger_service_id)) continue;

      // Calculate scheduled_for
      const delayMs = (rule.delay_days * 1440 + (rule.delay_minutes || 0)) * 60 * 1000;
      const scheduledFor = new Date(new Date(tx.transaction_date).getTime() + delayMs).toISOString();

      toInsert.push({
        lifecycle_rule_id: rule.id,
        customer_id: tx.customer_id,
        transaction_id: tx.id,
        trigger_event: 'transaction_completed',
        triggered_at: tx.transaction_date,
        scheduled_for: scheduledFor,
        status: 'pending',
      });

      // Mark in dedup sets
      txDedupSet.add(`${rule.id}:${tx.id}`);
      customerDedupSet.add(`${rule.id}:${tx.customer_id}`);
    }
  }

  if (toInsert.length > 0) {
    const { data: inserted, error: insertErr } = await admin
      .from('lifecycle_executions')
      .insert(toInsert)
      .select('id');

    if (insertErr) {
      if (insertErr.code === '23505') {
        console.log('Some transaction executions already existed (race condition), skipping duplicates');
      } else {
        console.error('Failed to insert transaction executions:', insertErr);
      }
    }
    scheduled += inserted?.length ?? 0;
  }

  return scheduled;
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
  trigger_event: string;
  [key: string]: unknown;
}

async function executePending(
  admin: ReturnType<typeof createAdminClient>,
  executions: PendingExecution[]
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

  // Pre-load feature flag for review requests
  const { data: reviewFlag } = await admin
    .from('feature_flags')
    .select('enabled')
    .eq('key', FEATURE_FLAGS.GOOGLE_REVIEW_REQUESTS)
    .single();

  const reviewFlagEnabled = reviewFlag?.enabled ?? false;

  // Pre-load review URLs from business_settings
  const { data: reviewSettings } = await admin
    .from('business_settings')
    .select('key, value')
    .in('key', ['google_review_url', 'yelp_review_url']);

  let googleReviewUrl = '';
  let yelpReviewUrl = '';
  for (const s of reviewSettings || []) {
    const val = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
    // business_settings stores JSON values — strip wrapping quotes
    const cleaned = val.replace(/^"|"$/g, '');
    if (s.key === 'google_review_url') googleReviewUrl = cleaned;
    if (s.key === 'yelp_review_url') yelpReviewUrl = cleaned;
  }

  // Shorten review URLs once (reuse across all executions)
  let shortGoogleUrl = '';
  let shortYelpUrl = '';
  if (googleReviewUrl) {
    try {
      shortGoogleUrl = await createShortLink(googleReviewUrl);
    } catch (err) {
      console.error('Failed to shorten Google review URL:', err);
      shortGoogleUrl = googleReviewUrl;
    }
  }
  if (yelpReviewUrl) {
    try {
      shortYelpUrl = await createShortLink(yelpReviewUrl);
    } catch (err) {
      console.error('Failed to shorten Yelp review URL:', err);
      shortYelpUrl = yelpReviewUrl;
    }
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

      // Check feature flag for review-related templates
      const template = rule.sms_template || '';
      const usesReviewLink = template.includes('{googleReviewLink}') || template.includes('{yelpReviewLink}');
      if (usesReviewLink && !reviewFlagEnabled) {
        await markExecution(admin, exec.id, 'skipped', 'Google review requests feature flag disabled');
        skipped++;
        continue;
      }

      // Load customer
      const { data: customer } = await admin
        .from('customers')
        .select('first_name, phone, sms_consent')
        .eq('id', exec.customer_id)
        .single();

      if (!customer?.phone || !customer.sms_consent) {
        await markExecution(admin, exec.id, 'skipped', 'No phone or consent revoked');
        skipped++;
        continue;
      }

      // Load context: vehicle + service names
      let vehicleInfo = '';
      let serviceName = '';

      if (exec.appointment_id) {
        // Load vehicle from appointment
        const { data: apt } = await admin
          .from('appointments')
          .select('vehicle_id')
          .eq('id', exec.appointment_id)
          .single();

        if (apt?.vehicle_id) {
          const { data: vehicle } = await admin
            .from('vehicles')
            .select('year, make, model')
            .eq('id', apt.vehicle_id)
            .single();

          if (vehicle) {
            vehicleInfo = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
          }
        }

        // Load service names from appointment_services
        const { data: aptServices } = await admin
          .from('appointment_services')
          .select('services(name)')
          .eq('appointment_id', exec.appointment_id);

        if (aptServices && aptServices.length > 0) {
          const names = aptServices
            .map((s) => (s.services as unknown as { name: string })?.name)
            .filter(Boolean);
          serviceName = names.join(', ');
        }
      } else if (exec.transaction_id) {
        // Load vehicle from transaction
        const { data: tx } = await admin
          .from('transactions')
          .select('vehicle_id')
          .eq('id', exec.transaction_id)
          .single();

        if (tx?.vehicle_id) {
          const { data: vehicle } = await admin
            .from('vehicles')
            .select('year, make, model')
            .eq('id', tx.vehicle_id)
            .single();

          if (vehicle) {
            vehicleInfo = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
          }
        }

        // Load item names from transaction_items
        const { data: txItems } = await admin
          .from('transaction_items')
          .select('item_name')
          .eq('transaction_id', exec.transaction_id)
          .limit(5);

        if (txItems && txItems.length > 0) {
          serviceName = txItems.map((i) => i.item_name).filter(Boolean).join(', ');
        }
      }

      // Replace template variables
      let message = template
        .replace(/\{firstName\}/g, customer.first_name || 'there')
        .replace(/\{serviceName\}/g, serviceName || 'your service')
        .replace(/\{vehicleInfo\}/g, vehicleInfo)
        .replace(/\{googleReviewLink\}/g, shortGoogleUrl)
        .replace(/\{yelpReviewLink\}/g, shortYelpUrl);

      // Clean up empty vehicle references (e.g. "your " if no vehicle)
      message = message.replace(/your\s+(?=to |!|\.|\s*$)/g, '');

      // Send via marketing SMS (appends STOP footer)
      const result = await sendMarketingSms(customer.phone, message);

      if (result.success) {
        await markExecution(admin, exec.id, 'sent');
        sent++;
      } else {
        await markExecution(admin, exec.id, 'failed', result.error);
        failed++;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Lifecycle execution ${exec.id} failed:`, err);
      try {
        await markExecution(admin, exec.id, 'failed', errorMsg);
      } catch {
        // Don't let status update failure block processing
      }
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

  await admin
    .from('lifecycle_executions')
    .update(update)
    .eq('id', id);
}
