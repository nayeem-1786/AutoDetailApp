import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, getPeriodDates } from '@/lib/utils/analytics-helpers';
import { getAttributedRevenue } from '@/lib/utils/attribution';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin();
    if ('error' in auth) return auth.error;
    const { adminClient } = auth;

    const period = request.nextUrl.searchParams.get('period') || '30d';
    const { start, end } = getPeriodDates(period);

    // Get all active lifecycle rules
    const { data: rules } = await adminClient
      .from('lifecycle_rules')
      .select('id, name, trigger_condition, is_active')
      .order('name');

    if (!rules || rules.length === 0) {
      return NextResponse.json({ automations: [] });
    }

    const results = [];

    for (const rule of rules) {
      // Total executions in period
      const { count: totalExecutions } = await adminClient
        .from('lifecycle_executions')
        .select('id', { count: 'exact', head: true })
        .eq('lifecycle_rule_id', rule.id)
        .gte('created_at', start)
        .lte('created_at', end);

      // Sent executions
      const { count: sentCount } = await adminClient
        .from('lifecycle_executions')
        .select('id', { count: 'exact', head: true })
        .eq('lifecycle_rule_id', rule.id)
        .eq('status', 'sent')
        .gte('created_at', start)
        .lte('created_at', end);

      // Get customer IDs from sent executions for delivery/click stats
      const { data: sentExecutions } = await adminClient
        .from('lifecycle_executions')
        .select('id, customer_id')
        .eq('lifecycle_rule_id', rule.id)
        .eq('status', 'sent')
        .gte('created_at', start)
        .lte('created_at', end);

      const executionIds = (sentExecutions ?? []).map((e: { id: string }) => e.id);
      const customerIds = (sentExecutions ?? [])
        .map((e: { customer_id: string }) => e.customer_id)
        .filter(Boolean);

      // SMS delivery for these executions
      let delivered = 0;
      if (executionIds.length > 0) {
        const { count: smsDelivered } = await adminClient
          .from('sms_delivery_log')
          .select('id', { count: 'exact', head: true })
          .in('lifecycle_execution_id', executionIds)
          .eq('status', 'delivered');

        delivered = smsDelivered ?? 0;
      }

      // Click tracking - check email delivery log for lifecycle-related clicks
      let clicked = 0;
      if (customerIds.length > 0) {
        // For lifecycle automations, clicks come from short_links used in SMS
        // We don't have direct click tracking per lifecycle execution,
        // but we can count email clicks if email was sent
        const { count: emailClicks } = await adminClient
          .from('email_delivery_log')
          .select('id', { count: 'exact', head: true })
          .in('customer_id', customerIds)
          .eq('event', 'clicked')
          .gte('created_at', start)
          .lte('created_at', end);

        clicked = emailClicks ?? 0;
      }

      // Attribution
      let conversions = 0;
      let revenue = 0;
      const attribution = await getAttributedRevenue({
        lifecycleRuleId: rule.id,
        periodStart: start,
        periodEnd: end,
        windowDays: 7,
      });

      conversions = attribution.uniqueCustomers;
      revenue = attribution.totalRevenue;

      results.push({
        ruleId: rule.id,
        name: rule.name,
        trigger: rule.trigger_condition,
        isActive: rule.is_active,
        totalExecutions: totalExecutions ?? 0,
        delivered,
        clicked,
        conversions,
        revenue,
      });
    }

    return NextResponse.json({ automations: results });
  } catch (err) {
    console.error('Marketing automations analytics GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
