import { createAdminClient } from '@/lib/supabase/admin';
import { getAttributedRevenue } from '@/lib/utils/attribution';

/**
 * Split recipients into variant groups based on split percentages.
 * Returns Map<variantId, customerIds[]>
 */
export function splitRecipients(
  recipients: { customerId: string }[],
  variants: { id: string; splitPercentage: number }[]
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  variants.forEach(v => result.set(v.id, []));

  // Shuffle recipients for randomization
  const shuffled = [...recipients].sort(() => Math.random() - 0.5);

  // Calculate cumulative thresholds
  const thresholds: { id: string; cumulative: number }[] = [];
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.splitPercentage;
    thresholds.push({ id: variant.id, cumulative });
  }

  // Assign each recipient based on their position relative to thresholds
  for (let i = 0; i < shuffled.length; i++) {
    const position = ((i + 1) / shuffled.length) * 100;

    // Find which variant this position falls into
    let assignedVariant = thresholds[thresholds.length - 1].id; // fallback to last
    for (const threshold of thresholds) {
      if (position <= threshold.cumulative) {
        assignedVariant = threshold.id;
        break;
      }
    }

    const list = result.get(assignedVariant)!;
    list.push(shuffled[i].customerId);
  }

  return result;
}

export interface VariantStats {
  variantId: string;
  label: string;
  sent: number;
  delivered: number;
  clicked: number;
  optedOut: number;
  conversions: number;
  revenue: number;
  isWinner: boolean;
}

/**
 * Get per-variant stats for an A/B test campaign.
 * Queries sms_delivery_log/email_delivery_log for delivery stats,
 * short_links click_count for clicks, and attribution for conversions/revenue.
 */
export async function getVariantStats(campaignId: string): Promise<VariantStats[]> {
  const supabase = createAdminClient();

  // Get variants for this campaign
  const { data: variants } = await supabase
    .from('campaign_variants')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('variant_label');

  if (!variants || variants.length === 0) {
    return [];
  }

  // Get campaign info for period
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('sent_at, channel')
    .eq('id', campaignId)
    .single();

  const stats: VariantStats[] = [];

  for (const variant of variants) {
    // Get recipients assigned to this variant
    const { data: recipients, count: sentCount } = await supabase
      .from('campaign_recipients')
      .select('customer_id', { count: 'exact' })
      .eq('campaign_id', campaignId)
      .eq('variant_id', variant.id);

    const sent = sentCount ?? 0;
    const customerIds = (recipients ?? [])
      .map((r: { customer_id: string }) => r.customer_id)
      .filter(Boolean);

    // SMS delivery stats
    let delivered = 0;
    if (customerIds.length > 0) {
      const { count: smsDelivered } = await supabase
        .from('sms_delivery_log')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('customer_id', customerIds)
        .eq('status', 'delivered');

      const { count: emailDelivered } = await supabase
        .from('email_delivery_log')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('customer_id', customerIds)
        .eq('event', 'delivered');

      delivered = (smsDelivered ?? 0) + (emailDelivered ?? 0);
    }

    // Click stats from email delivery log
    let clicked = 0;
    if (customerIds.length > 0) {
      const { count: clickCount } = await supabase
        .from('email_delivery_log')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('customer_id', customerIds)
        .eq('event', 'clicked');

      clicked = clickCount ?? 0;
    }

    // Opt-out stats from sms_consent_log
    let optedOut = 0;
    if (customerIds.length > 0 && campaign?.sent_at) {
      const { count: optOutCount } = await supabase
        .from('sms_consent_log')
        .select('id', { count: 'exact', head: true })
        .in('customer_id', customerIds)
        .eq('action', 'opt_out')
        .gte('created_at', campaign.sent_at);

      optedOut = optOutCount ?? 0;
    }

    // Attribution: conversions and revenue
    let conversions = 0;
    let revenue = 0;
    if (campaign?.sent_at && customerIds.length > 0) {
      const periodEnd = new Date(
        new Date(campaign.sent_at).getTime() + 30 * 24 * 60 * 60 * 1000
      ).toISOString();

      const attribution = await getAttributedRevenue({
        campaignId,
        periodStart: campaign.sent_at,
        periodEnd,
        windowDays: 7,
      });

      // Scale attribution proportionally to this variant's share
      // (attribution helper queries all recipients for the campaign,
      // so we approximate by variant's recipient ratio)
      if (sent > 0 && attribution.transactionCount > 0) {
        const totalRecipients = (await supabase
          .from('campaign_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId))?.count ?? sent;

        const ratio = sent / totalRecipients;
        conversions = Math.round(attribution.transactionCount * ratio);
        revenue = Math.round(attribution.totalRevenue * ratio * 100) / 100;
      }
    }

    stats.push({
      variantId: variant.id,
      label: variant.variant_label,
      sent,
      delivered,
      clicked,
      optedOut,
      conversions,
      revenue,
      isWinner: variant.is_winner ?? false,
    });
  }

  return stats;
}

/**
 * Determine the winning variant for an A/B test campaign.
 * Primary: click-through rate (clicks / delivered)
 * Secondary: delivery rate (delivered / sent)
 * Updates is_winner = true on the winning variant.
 * Returns the winning variant ID.
 */
export async function determineWinner(campaignId: string): Promise<string | null> {
  const stats = await getVariantStats(campaignId);
  if (stats.length === 0) return null;

  // Score each variant: primary = CTR, secondary = delivery rate
  let bestVariantId: string | null = null;
  let bestCtr = -1;
  let bestDeliveryRate = -1;

  for (const stat of stats) {
    const ctr = stat.delivered > 0 ? stat.clicked / stat.delivered : 0;
    const deliveryRate = stat.sent > 0 ? stat.delivered / stat.sent : 0;

    if (
      ctr > bestCtr ||
      (ctr === bestCtr && deliveryRate > bestDeliveryRate)
    ) {
      bestCtr = ctr;
      bestDeliveryRate = deliveryRate;
      bestVariantId = stat.variantId;
    }
  }

  if (!bestVariantId) return null;

  // Update database: clear all winners, then set new winner
  const supabase = createAdminClient();

  await supabase
    .from('campaign_variants')
    .update({ is_winner: false })
    .eq('campaign_id', campaignId);

  await supabase
    .from('campaign_variants')
    .update({ is_winner: true })
    .eq('id', bestVariantId);

  return bestVariantId;
}
