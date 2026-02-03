// Audience query builder for marketing campaigns

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampaignChannel } from '@/lib/supabase/types';

export interface AudienceFilters {
  last_service?: string;       // service_id
  days_since_visit_min?: number;
  days_since_visit_max?: number;
  vehicle_type?: string;
  min_spend?: number;
  tags?: string[];
  has_email?: boolean;
  has_phone?: boolean;
}

export interface AudienceResult {
  query: ReturnType<SupabaseClient['from']>;
  count: number;
}

/**
 * Apply audience filters (without consent) to a query.
 * Returns the filtered query.
 */
function applyFilters(
  query: ReturnType<ReturnType<SupabaseClient['from']>['select']>,
  filters: AudienceFilters
) {
  // Filter: days_since_visit
  if (filters.days_since_visit_min != null) {
    const date = new Date();
    date.setDate(date.getDate() - filters.days_since_visit_min);
    query = query.lte('last_visit_date', date.toISOString().split('T')[0]);
  }
  if (filters.days_since_visit_max != null) {
    const date = new Date();
    date.setDate(date.getDate() - filters.days_since_visit_max);
    query = query.gte('last_visit_date', date.toISOString().split('T')[0]);
  }

  // Filter: minimum spend
  if (filters.min_spend != null) {
    query = query.gte('lifetime_spend', filters.min_spend);
  }

  // Filter: tags (contains all)
  if (filters.tags && filters.tags.length > 0) {
    query = query.contains('tags', filters.tags);
  }

  // Filter: has_email / has_phone
  if (filters.has_email) {
    query = query.not('email', 'is', null);
  }
  if (filters.has_phone) {
    query = query.not('phone', 'is', null);
  }

  return query;
}

/**
 * Apply consent enforcement to a query.
 */
function applyConsent(
  query: ReturnType<ReturnType<SupabaseClient['from']>['select']>,
  channel: CampaignChannel
) {
  if (channel === 'sms') {
    query = query.eq('sms_consent', true).not('phone', 'is', null);
  } else if (channel === 'email') {
    query = query.eq('email_consent', true).not('email', 'is', null);
  } else {
    // 'both' — need at least one consented channel
    query = query.or(
      'and(sms_consent.eq.true,phone.not.is.null),and(email_consent.eq.true,email.not.is.null)'
    );
  }
  return query;
}

/**
 * Preview audience count — returns both total matches and consent-eligible count.
 */
export async function previewAudienceCount(
  supabase: SupabaseClient,
  filters: AudienceFilters,
  channel: CampaignChannel
): Promise<{ totalMatch: number; consentEligible: number }> {
  // Count without consent
  const totalQuery = applyFilters(
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    filters
  );
  const { count: totalMatch } = await totalQuery;

  // Count with consent
  const consentQuery = applyConsent(
    applyFilters(
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      filters
    ),
    channel
  );
  const { count: consentEligible } = await consentQuery;

  return {
    totalMatch: totalMatch ?? 0,
    consentEligible: consentEligible ?? 0,
  };
}

/**
 * Build a Supabase query for a campaign audience.
 * Always enforces consent: SMS → sms_consent=true, email → email_consent=true.
 */
export async function buildAudienceQuery(
  supabase: SupabaseClient,
  filters: AudienceFilters,
  channel: CampaignChannel,
  countOnly = false
): Promise<{ count: number; customerIds: string[] }> {
  let query = applyConsent(
    applyFilters(
      supabase.from('customers').select('id', { count: 'exact' }),
      filters
    ),
    channel
  );

  if (countOnly) {
    const { count } = await query;
    return { count: count ?? 0, customerIds: [] };
  }

  const { data, count } = await query;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customerIds = (data ?? []).map((c: any) => c.id as string);

  // Post-filter: last_service and vehicle_type require joins we handle separately
  let filteredIds = customerIds;

  if (filters.last_service) {
    // Find customers who have had this service via transactions
    const { data: txData } = await supabase
      .from('transactions')
      .select('customer_id, transaction_items!inner(service_id)')
      .eq('transaction_items.service_id', filters.last_service)
      .in('customer_id', filteredIds.length > 0 ? filteredIds : ['__none__']);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceCustomerIds = new Set(
      (txData ?? []).map((r: any) => r.customer_id as string)
    );
    filteredIds = filteredIds.filter((id: string) => serviceCustomerIds.has(id));
  }

  if (filters.vehicle_type) {
    const { data: vData } = await supabase
      .from('vehicles')
      .select('customer_id')
      .eq('vehicle_type', filters.vehicle_type)
      .in('customer_id', filteredIds.length > 0 ? filteredIds : ['__none__']);

    const vehicleCustomerIds = new Set(
      (vData ?? []).map((v: { customer_id: string }) => v.customer_id)
    );
    filteredIds = filteredIds.filter((id: string) => vehicleCustomerIds.has(id));
  }

  return { count: filteredIds.length, customerIds: filteredIds };
}
