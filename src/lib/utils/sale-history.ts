/**
 * Sale history archival utility.
 *
 * Archives current sale data to the sale_history table before it is
 * cleared or overwritten. Both the clear and batch endpoints call this.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SaleHistoryRecord } from '@/lib/supabase/types';

interface ArchiveSaleParams {
  supabase: SupabaseClient;
  serviceId?: string;
  productId?: string;
  endedReason: string;
  endedBy?: string;
}

/**
 * Archive the current sale data for a service or product into sale_history.
 * Returns the inserted record, or null if there was no sale data to archive.
 */
export async function archiveSaleData({
  supabase,
  serviceId,
  productId,
  endedReason,
  endedBy,
}: ArchiveSaleParams): Promise<SaleHistoryRecord | null> {
  if (serviceId) {
    return archiveServiceSale(supabase, serviceId, endedReason, endedBy);
  }
  if (productId) {
    return archiveProductSale(supabase, productId, endedReason, endedBy);
  }
  return null;
}

async function archiveServiceSale(
  supabase: SupabaseClient,
  serviceId: string,
  endedReason: string,
  endedBy?: string,
): Promise<SaleHistoryRecord | null> {
  const { data: svc } = await supabase
    .from('services')
    .select('sale_price_cents, sale_starts_at, sale_ends_at, pricing_model, flat_price_cents, per_unit_price_cents, per_unit_label, service_pricing(tier_name, tier_label, price_cents, sale_price_cents)')
    .eq('id', serviceId)
    .single();

  if (!svc) return null;

  const tiers: { tier_name: string; tier_label: string | null; price_cents: number; sale_price_cents: number | null }[] =
    svc.service_pricing ?? [];
  const pricingModel: string = svc.pricing_model;

  // Determine if there's actually a sale to archive
  let hasSaleData = false;
  let pricingSnapshot: unknown = null;

  if (pricingModel === 'flat') {
    if (svc.sale_price_cents != null) {
      hasSaleData = true;
      pricingSnapshot = {
        base_price: svc.flat_price_cents,
        sale_price_cents: svc.sale_price_cents,
      };
    }
  } else if (pricingModel === 'per_unit') {
    if (svc.sale_price_cents != null) {
      hasSaleData = true;
      pricingSnapshot = {
        base_price: svc.per_unit_price_cents,
        sale_price_cents: svc.sale_price_cents,
        per_unit_label: svc.per_unit_label,
      };
    }
  } else {
    // Tiered models: vehicle_size, scope, specialty
    const tiersWithSale = tiers.filter((t) => t.sale_price_cents != null);
    if (tiersWithSale.length > 0) {
      hasSaleData = true;
      pricingSnapshot = tiersWithSale.map((t) => ({
        tier_name: t.tier_name,
        tier_label: t.tier_label,
        base_price: t.price_cents,
        sale_price_cents: t.sale_price_cents,
      }));
    }
  }

  if (!hasSaleData) return null;

  const { data: record } = await supabase
    .from('sale_history')
    .insert({
      service_id: serviceId,
      pricing_snapshot: pricingSnapshot,
      pricing_model: pricingModel,
      sale_starts_at: svc.sale_starts_at,
      sale_ends_at: svc.sale_ends_at,
      ended_reason: endedReason,
      ended_by: endedBy ?? null,
    })
    .select()
    .single();

  return (record as SaleHistoryRecord) ?? null;
}

async function archiveProductSale(
  supabase: SupabaseClient,
  productId: string,
  endedReason: string,
  endedBy?: string,
): Promise<SaleHistoryRecord | null> {
  const { data: product } = await supabase
    .from('products')
    .select('sale_price_cents, sale_starts_at, sale_ends_at, retail_price_cents')
    .eq('id', productId)
    .single();

  if (!product || product.sale_price_cents == null) return null;

  const pricingSnapshot = {
    retail_price_cents: product.retail_price_cents,
    sale_price_cents: product.sale_price_cents,
  };

  const { data: record } = await supabase
    .from('sale_history')
    .insert({
      product_id: productId,
      pricing_snapshot: pricingSnapshot,
      pricing_model: null,
      sale_starts_at: product.sale_starts_at,
      sale_ends_at: product.sale_ends_at,
      ended_reason: endedReason,
      ended_by: endedBy ?? null,
    })
    .select()
    .single();

  return (record as SaleHistoryRecord) ?? null;
}
