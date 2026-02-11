import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMarketingSms } from '@/lib/utils/sms';
import { renderTemplate, cleanEmptyReviewLines, formatPhoneDisplay, formatDollar, formatNumber } from '@/lib/utils/template';
import { getBusinessInfo } from '@/lib/data/business';
import { createShortLink } from '@/lib/utils/short-link';
import { FEATURE_FLAGS } from '@/lib/utils/constants';

/**
 * Lifecycle execution engine cron endpoint.
 *
 * Runs in two phases per invocation:
 *   Phase 1 — Schedule: find recent completions, insert pending lifecycle_executions
 *   Phase 2 — Execute: send SMS for executions whose scheduled_for <= now
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
    const serviceRules = rules.filter(
      (r) => r.trigger_condition === 'service_completed'
    );
    const transactionRules = rules.filter(
      (r) => r.trigger_condition === 'after_transaction'
    );

    if (serviceRules.length > 0) {
      scheduled += await scheduleFromAppointments(admin, serviceRules, lookbackWindow, thirtyDaysAgo);
    }

    if (transactionRules.length > 0) {
      scheduled += await scheduleFromTransactions(admin, transactionRules, lookbackWindow, thirtyDaysAgo);
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
// Phase 1A — Schedule from completed appointments
// ===========================================================================

interface Rule {
  id: string;
  trigger_service_id: string | null;
  delay_days: number;
  delay_minutes: number;
  [key: string]: unknown;
}

async function scheduleFromAppointments(
  admin: ReturnType<typeof createAdminClient>,
  rules: Rule[],
  lookbackWindow: string,
  thirtyDaysAgo: string
): Promise<number> {
  // Find recently completed appointments with a customer who has a phone
  const { data: appointments, error } = await admin
    .from('appointments')
    .select(`
      id,
      customer_id,
      updated_at,
      customers!inner(id, phone, sms_consent),
      appointment_services(service_id)
    `)
    .eq('status', 'completed')
    .gte('updated_at', lookbackWindow)
    .not('customer_id', 'is', null);

  if (error || !appointments?.length) {
    if (error) console.error('Failed to query completed appointments:', error);
    return 0;
  }

  return scheduleExecutions(
    admin,
    rules,
    appointments.map((apt) => ({
      sourceId: apt.id,
      sourceField: 'appointment_id' as const,
      customerId: apt.customer_id!,
      triggeredAt: apt.updated_at,
      customer: apt.customers as unknown as { phone: string | null; sms_consent: boolean },
      serviceIds: ((apt.appointment_services || []) as Array<{ service_id: string }>).map(
        (s) => s.service_id
      ),
    })),
    'appointment_completed',
    thirtyDaysAgo
  );
}

// ===========================================================================
// Phase 1B — Schedule from completed transactions
// ===========================================================================

async function scheduleFromTransactions(
  admin: ReturnType<typeof createAdminClient>,
  rules: Rule[],
  lookbackWindow: string,
  thirtyDaysAgo: string
): Promise<number> {
  const { data: transactions, error } = await admin
    .from('transactions')
    .select(`
      id,
      customer_id,
      transaction_date,
      customers!inner(id, phone, sms_consent),
      transaction_items(service_id)
    `)
    .eq('status', 'completed')
    .gte('transaction_date', lookbackWindow)
    .not('customer_id', 'is', null);

  if (error || !transactions?.length) {
    if (error) console.error('Failed to query completed transactions:', error);
    return 0;
  }

  return scheduleExecutions(
    admin,
    rules,
    transactions.map((tx) => ({
      sourceId: tx.id,
      sourceField: 'transaction_id' as const,
      customerId: tx.customer_id!,
      triggeredAt: tx.transaction_date,
      customer: tx.customers as unknown as { phone: string | null; sms_consent: boolean },
      serviceIds: ((tx.transaction_items || []) as Array<{ service_id: string | null }>)
        .map((i) => i.service_id)
        .filter(Boolean) as string[],
    })),
    'transaction_completed',
    thirtyDaysAgo
  );
}

// ===========================================================================
// Shared scheduling logic (dedup + insert)
// ===========================================================================

interface TriggerEvent {
  sourceId: string;
  sourceField: 'appointment_id' | 'transaction_id';
  customerId: string;
  triggeredAt: string;
  customer: { phone: string | null; sms_consent: boolean };
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
    .select('lifecycle_rule_id, appointment_id, transaction_id')
    .in('lifecycle_rule_id', ruleIds)
    .in(sourceField, sourceIds);

  const sourceDedupSet = new Set(
    (existingBySource || []).map((e) => {
      const sid = sourceField === 'appointment_id' ? e.appointment_id : e.transaction_id;
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
    if (!event.customer?.phone || !event.customer.sms_consent) continue;

    for (const rule of rules) {
      if (sourceDedupSet.has(`${rule.id}:${event.sourceId}`)) continue;
      if (customerDedupSet.has(`${rule.id}:${event.customerId}`)) continue;

      // Service filter: rule targeting a specific service must match
      if (rule.trigger_service_id && !event.serviceIds.includes(rule.trigger_service_id)) continue;

      const delayMs = (rule.delay_days * 1440 + (rule.delay_minutes || 0)) * 60 * 1000;
      const scheduledFor = new Date(new Date(event.triggeredAt).getTime() + delayMs).toISOString();

      toInsert.push({
        lifecycle_rule_id: rule.id,
        customer_id: event.customerId,
        [event.sourceField]: event.sourceId,
        trigger_event: triggerEvent,
        triggered_at: event.triggeredAt,
        scheduled_for: scheduledFor,
        status: 'pending',
      });

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

  // Pre-load coupon templates for rules that have coupon_id
  const couponIds = [...new Set(
    (rulesData || [])
      .filter((r) => r.coupon_id)
      .map((r) => r.coupon_id as string)
  )];
  const couponTemplatesMap = new Map<string, Record<string, unknown>>();
  if (couponIds.length > 0) {
    const { data: couponData } = await admin
      .from('coupons')
      .select('*, coupon_rewards(*)')
      .in('id', couponIds);
    for (const c of couponData || []) {
      couponTemplatesMap.set(c.id, c);
    }
  }

  // Pre-load feature flag
  const { data: reviewFlag } = await admin
    .from('feature_flags')
    .select('enabled')
    .eq('key', FEATURE_FLAGS.GOOGLE_REVIEW_REQUESTS)
    .single();

  const reviewFlagEnabled = reviewFlag?.enabled ?? false;

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

  const businessName = settingsMap.business_name || 'Smart Detail Auto Spa & Supplies';
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
        .select('first_name, last_name, phone, email, sms_consent, loyalty_points_balance, visit_count, last_visit_date, lifetime_spend')
        .eq('id', exec.customer_id)
        .single();

      if (!customer?.phone || !customer.sms_consent) {
        await markExecution(admin, exec.id, 'skipped', 'No phone or consent revoked');
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
            vehicleDescription = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
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
            vehicleDescription = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
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
          name: (couponTemplate as any).name,
          auto_apply: false,
          min_purchase: (couponTemplate as any).min_purchase,
          is_single_use: true,
          max_uses: 1,
          expires_at: (couponTemplate as any).expires_at,
          customer_id: exec.customer_id,
          status: 'active',
        }).select().single();

        // Clone rewards from template coupon
        if (newCoupon && (couponTemplate as any).coupon_rewards) {
          const rewards = ((couponTemplate as any).coupon_rewards as any[]).map((r) => ({
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
        const rewards = (couponTemplate as any).coupon_rewards as any[] | undefined;
        const targetProductId = rewards?.[0]?.target_product_id;
        if (targetProductId) {
          const { data: prod } = await admin
            .from('products').select('slug, product_categories(slug)').eq('id', targetProductId).single();
          couponProductSlug = prod?.slug ?? null;
          couponProductCategorySlug = (prod?.product_categories as any)?.slug ?? null;
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

      // Render template with snake_case variables matching TEMPLATE_VARIABLES
      let message = renderTemplate(template, {
        first_name: customer.first_name || 'there',
        last_name: customer.last_name || '',
        service_name: serviceName || 'your service',
        vehicle_info: vehicleDescription,
        business_name: businessName,
        business_phone: formatPhoneDisplay(businessInfo.phone),
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
      });

      // Clean up lines with empty review links (e.g., if URL not configured)
      message = cleanEmptyReviewLines(message);

      // Send via marketing SMS (appends STOP footer, wraps URLs for click tracking)
      const result = await sendMarketingSms(customer.phone, message, exec.customer_id, {
        lifecycleExecutionId: exec.id,
        source: 'lifecycle',
      });

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
