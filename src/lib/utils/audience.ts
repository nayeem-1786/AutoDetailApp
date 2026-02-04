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
 * Note: last_service and vehicle_type require joins and are handled separately.
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
 * Check if a customer row has consent for a channel (in-memory check).
 */
function hasConsent(
  row: { email: string | null; phone: string | null; email_consent: boolean; sms_consent: boolean },
  channel: CampaignChannel
): boolean {
  if (channel === 'sms') return row.sms_consent && !!row.phone;
  if (channel === 'email') return row.email_consent && !!row.email;
  // 'both' — at least one
  return (row.sms_consent && !!row.phone) || (row.email_consent && !!row.email);
}

/**
 * Apply join-based filters (last_service, vehicle_type) by post-filtering IDs.
 */
async function applyJoinFilters(
  supabase: SupabaseClient,
  customerIds: string[],
  filters: AudienceFilters
): Promise<string[]> {
  if (customerIds.length === 0) return [];
  let filtered = customerIds;

  if (filters.last_service) {
    const { data: txData } = await supabase
      .from('transactions')
      .select('customer_id, transaction_items!inner(service_id)')
      .eq('transaction_items.service_id', filters.last_service)
      .in('customer_id', filtered);

    const serviceCustomerIds = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (txData ?? []).map((r: any) => r.customer_id as string)
    );
    filtered = filtered.filter((id) => serviceCustomerIds.has(id));
  }

  if (filters.vehicle_type) {
    const { data: vData } = await supabase
      .from('vehicles')
      .select('customer_id')
      .eq('vehicle_type', filters.vehicle_type)
      .in('customer_id', filtered);

    const vehicleCustomerIds = new Set(
      (vData ?? []).map((v: { customer_id: string }) => v.customer_id)
    );
    filtered = filtered.filter((id) => vehicleCustomerIds.has(id));
  }

  return filtered;
}

/**
 * Whether the filters include join-based conditions that require post-filtering.
 */
function hasJoinFilters(filters: AudienceFilters): boolean {
  return !!filters.last_service || !!filters.vehicle_type;
}

/**
 * Preview audience count — returns both total matches and consent-eligible count.
 * Consent-eligible is always a subset of totalMatch.
 */
export async function previewAudienceCount(
  supabase: SupabaseClient,
  filters: AudienceFilters,
  channel: CampaignChannel
): Promise<{ totalMatch: number; consentEligible: number; error?: string }> {
  const needsJoins = hasJoinFilters(filters);

  if (!needsJoins) {
    // Fast path: pure SQL counts, no post-filtering needed
    const totalResult = await applyFilters(
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      filters
    );
    if (totalResult.error) {
      console.error('Audience total count error:', totalResult.error);
      return { totalMatch: 0, consentEligible: 0, error: totalResult.error.message };
    }

    const consentResult = await applyConsent(
      applyFilters(
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        filters
      ),
      channel
    );
    if (consentResult.error) {
      console.error('Audience consent count error:', consentResult.error);
      return { totalMatch: totalResult.count ?? 0, consentEligible: 0, error: consentResult.error.message };
    }

    return {
      totalMatch: totalResult.count ?? 0,
      consentEligible: consentResult.count ?? 0,
    };
  }

  // Slow path: fetch customer rows, apply join filters, then derive consent from same set.
  // This guarantees consentEligible <= totalMatch since both come from the same base set.
  const rowsResult = await applyFilters(
    supabase.from('customers').select('id, email, phone, email_consent, sms_consent'),
    filters
  );
  if (rowsResult.error) {
    console.error('Audience rows error:', rowsResult.error);
    return { totalMatch: 0, consentEligible: 0, error: rowsResult.error.message };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = (rowsResult.data ?? []) as any[];
  const allIds = allRows.map((r) => r.id as string);

  // Apply join-based filters (last_service, vehicle_type)
  const matchedIds = await applyJoinFilters(supabase, allIds, filters);
  const matchedIdSet = new Set(matchedIds);

  // Filter the original rows to the matched set, then check consent in memory
  const matchedRows = allRows.filter((r) => matchedIdSet.has(r.id));
  const consentCount = matchedRows.filter((r) => hasConsent(r, channel)).length;

  return {
    totalMatch: matchedRows.length,
    consentEligible: consentCount,
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
  const query = applyConsent(
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

  const filteredIds = await applyJoinFilters(supabase, customerIds, filters);

  return { count: filteredIds.length, customerIds: filteredIds };
}
