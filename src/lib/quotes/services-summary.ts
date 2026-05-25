/**
 * D45 (Issue 39) — high-level `{services}` SMS chip composer.
 *
 * Replaces the inline `items.map(i => i.item_name).join(', ')` pattern at
 * 5 chip-composing call sites (`send-quote-sms` route, `quotes/[id]/accept`,
 * `pos/jobs/[id]/cancel`, `convert-service.ts` → cascades to
 * `voice-agent/appointments`) so that multi-tier same-service quotes
 * (post-D43 contract) compose a coherent customer-facing summary rather
 * than duplicating the parent service name.
 *
 * Operator-locked rendering rules (Issue 39 audit Targets 3-5,
 * 2026-05-26):
 *
 *   1. Multi-tier same-service group → `Service Name (token + token + …)`.
 *      Tokens ordered by `total_price DESC`, tie-break by
 *      `service_pricing.display_order ASC`.
 *   2. Single-tier qty=1 in `scope` pricing model → parens kept to surface
 *      tier_label ("Hot Shampoo Extraction (Carpet & Mats)"). This is the
 *      Issue-39 condition-(c) case.
 *   3. Single-tier qty=1 in `vehicle_size` / `specialty` pricing model →
 *      no parens. The customer already knows their vehicle / specialty
 *      type and the catalog name conveys everything else
 *      ("Express Interior Clean").
 *   4. Single-tier qty>1 (per_row × N case) → parens kept with
 *      `${qty} ${pluralize(qty_label)}` ("Hot Shampoo Extraction (3 Rows)").
 *   5. Mixed quote (multi-tier scope + single-tier vehicle_size) →
 *      "Hot Shampoo Extraction (2 Rows + Floor Mats), Ceramic Shield".
 *
 * Per-tier token rendering is delegated to `renderTierToken` from
 * `./tier-display.ts` — the same low-level helper the 15 Issue 41
 * visual surfaces consume directly in D46. The two layers stay split so
 * the chip composer can evolve independently of per-line visual
 * presentation.
 *
 * `enrichItemsWithTierMeta` is a sibling I/O helper that loads
 * `service_pricing.tier_label` / `qty_label` / `display_order` and
 * `services.pricing_model` in two batched queries for any set of raw
 * quote_items / appointment_services. Adoption sites use it to bridge
 * their existing fetch shape to `ServicesSummaryItem` without duplicating
 * the batched-lookup boilerplate at 4+ sites.
 *
 * See `docs/dev/ISSUE_39_SERVICES_CHIP_AUDIT.md` (Targets 1-7) and
 * `docs/dev/ISSUE_41_TIER_VISUAL_SURFACES_AUDIT.md` (Target 7) for full
 * design rationale.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { renderTierToken, type TierDisplayItem } from './tier-display';

/** Per-item shape consumed by `formatServicesSummary`. Extends
 * `TierDisplayItem` with the service-name + pricing-model + per-item
 * total-price + display-order fields the composer needs for grouping,
 * parens-rule evaluation, and ordering. */
export interface ServicesSummaryItem extends TierDisplayItem {
  /** UUID. Null is allowed (product-only items, legacy rows); null items
   * group together under a sentinel key. */
  service_id: string | null;
  /** Parent service name, equivalent to `quote_items.item_name`. Used as
   * the prefix outside the optional parens. */
  service_name: string;
  /** From `services.pricing_model`. Drives the condition-(c) "scope keeps
   * parens at qty=1" rule. Other values (`vehicle_size`, `specialty`,
   * `flat`, `per_unit`, `custom`) omit parens when there's only one tier
   * at qty=1. Optional — when omitted the composer defaults to the
   * conservative "no parens" branch for single-tier qty=1. */
  service_pricing_model?: string | null;
  /** Per-unit price; used to compute `total_price` for sorting when
   * `total_price` isn't supplied. */
  unit_price: number;
  /** Line total. Defaults to `unit_price * (quantity ?? 1)` when
   * omitted. Used as the primary tier-ordering key (DESC). */
  total_price?: number;
  /** From `service_pricing.display_order`. Tie-break ordering key when
   * two tiers have identical `total_price`. */
  display_order?: number;
}

/**
 * Compose the human-readable services summary chip from a set of
 * quote_items (or appointment_services / transaction_items).
 *
 * Returns the empty string for empty input. Multi-service input is
 * comma-joined in the order services first appear in the input
 * sequence (stable across re-orderings of the input array, predictable
 * for templates).
 */
export function formatServicesSummary(items: ServicesSummaryItem[]): string {
  if (items.length === 0) return '';

  // Group by service_id, preserving first-encounter order. Null
  // service_id collapses under a sentinel key so legacy / product-only
  // rows don't crash the renderer.
  const orderedKeys: string[] = [];
  const groups = new Map<string, ServicesSummaryItem[]>();
  for (const item of items) {
    const key = item.service_id ?? '__no_service_id__';
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
      orderedKeys.push(key);
    }
  }

  const renderedGroups: string[] = [];
  for (const key of orderedKeys) {
    const groupItems = groups.get(key);
    if (!groupItems || groupItems.length === 0) continue;
    renderedGroups.push(renderServiceGroup(groupItems));
  }

  return renderedGroups.join(', ');
}

function renderServiceGroup(items: ServicesSummaryItem[]): string {
  const first = items[0];
  const serviceName = first.service_name;
  const pricingModel = first.service_pricing_model;

  // Parens-rule conditions (operator decisions 4-7):
  //   a) > 1 quote_item for this service (multi-tier same-service) — the
  //      Issue 39 trigger.
  //   b) Any quote_item with quantity > 1 — the per_row × N case.
  //   c) `scope` pricing model — keep parens even at single-tier qty=1
  //      because tier_label is informative ("Carpet & Mats" is
  //      meaningful context).
  // vehicle_size / specialty / flat / per_unit / custom with a single
  // tier at qty=1 → OMIT parens.
  const shouldShowParens =
    items.length > 1 ||
    items.some((i) => (i.quantity ?? 1) > 1) ||
    pricingModel === 'scope';

  if (!shouldShowParens) {
    return serviceName;
  }

  // Sort by total_price DESC, tie-break by display_order ASC.
  // Verified empirically against operator's Hot Shampoo example:
  // (floor_mats × 1 = $75) + (per_row × 2 = $250) → per_row first
  // because $250 > $75 → "Hot Shampoo Extraction (2 Rows + Floor Mats)".
  const sorted = [...items].sort((a, b) => {
    const totalA = a.total_price ?? a.unit_price * (a.quantity ?? 1);
    const totalB = b.total_price ?? b.unit_price * (b.quantity ?? 1);
    if (totalB !== totalA) return totalB - totalA;
    return (a.display_order ?? 0) - (b.display_order ?? 0);
  });

  // Render each tier token. Skip nulls — defensive against an upstream
  // bug where a multi-tier group contains an item with no rendable
  // tier (shouldn't happen because the parens-rule above gates on
  // multi-tier OR qty>1 OR scope, all of which imply a real tier).
  const tokens = sorted
    .map((item) => renderTierToken(item))
    .filter((t): t is string => t !== null);

  if (tokens.length === 0) {
    // All tokens nulled out — fall back to bare service name.
    return serviceName;
  }

  return `${serviceName} (${tokens.join(' + ')})`;
}

// ---------------------------------------------------------------------------
// Batched-lookup helper for adoption sites.
// ---------------------------------------------------------------------------

/** Input shape expected by `enrichItemsWithTierMeta`. Compatible with
 * raw `quote_items` rows (which carry `service_id`, `item_name`,
 * `tier_name`, `quantity`, `unit_price`) and with similar shapes from
 * `appointment_services` / `transaction_items` after a minimal alias. */
export interface RawQuoteItemForEnrichment {
  service_id: string | null;
  item_name: string;
  tier_name: string | null;
  quantity: number;
  unit_price: number;
  total_price?: number | string | null;
}

/**
 * Load `service_pricing.tier_label` / `qty_label` / `display_order` and
 * `services.pricing_model` for a set of items in two batched queries,
 * then return enriched `ServicesSummaryItem[]` ready to pass into
 * `formatServicesSummary`.
 *
 * Adoption sites that already have the enrichment data in scope
 * (e.g., `send-quote-sms` already loads `service.service_pricing` via
 * `resolveServiceByName`) can skip this helper and map directly. The
 * helper exists to keep the 4 sites that fetch from `quote_items` /
 * `appointment_services` without joins to a single line of adoption.
 *
 * Items with null `service_id` (product-only rows, legacy data) pass
 * through with empty meta — the composer falls through to the
 * no-parens branch for them.
 *
 * On query error, logs a warning and returns items with empty meta
 * rather than throwing — chip composition is a presentation concern
 * and must not block the calling flow (SMS send, quote acceptance,
 * etc.).
 */
export async function enrichItemsWithTierMeta(
  admin: SupabaseClient,
  items: RawQuoteItemForEnrichment[],
): Promise<ServicesSummaryItem[]> {
  if (items.length === 0) return [];

  const serviceIds = Array.from(
    new Set(items.map((i) => i.service_id).filter((id): id is string => !!id)),
  );

  if (serviceIds.length === 0) {
    return items.map((i) => mapToSummaryItem(i, null, null));
  }

  let pricingModels = new Map<string, string | null>();
  let tierMeta = new Map<
    string,
    { tier_label: string | null; qty_label: string | null; display_order: number | null }
  >();

  try {
    const [{ data: services }, { data: tiers }] = await Promise.all([
      admin
        .from('services')
        .select('id, pricing_model')
        .in('id', serviceIds),
      admin
        .from('service_pricing')
        .select('service_id, tier_name, tier_label, qty_label, display_order')
        .in('service_id', serviceIds),
    ]);

    if (services) {
      pricingModels = new Map(
        (services as Array<{ id: string; pricing_model: string | null }>).map(
          (s) => [s.id, s.pricing_model],
        ),
      );
    }

    if (tiers) {
      tierMeta = new Map(
        (
          tiers as Array<{
            service_id: string;
            tier_name: string;
            tier_label: string | null;
            qty_label: string | null;
            display_order: number | null;
          }>
        ).map((t) => [
          tierMetaKey(t.service_id, t.tier_name),
          {
            tier_label: t.tier_label,
            qty_label: t.qty_label,
            display_order: t.display_order,
          },
        ]),
      );
    }
  } catch (err) {
    console.warn(
      '[services-summary] enrichItemsWithTierMeta lookup failed (non-blocking) —',
      err instanceof Error ? err.message : err,
    );
  }

  return items.map((item) => {
    const pricingModel = item.service_id
      ? pricingModels.get(item.service_id) ?? null
      : null;
    const meta = item.service_id && item.tier_name
      ? tierMeta.get(tierMetaKey(item.service_id, item.tier_name)) ?? null
      : null;
    return mapToSummaryItem(item, pricingModel, meta);
  });
}

function tierMetaKey(serviceId: string, tierName: string): string {
  return `${serviceId}::${tierName}`;
}

function mapToSummaryItem(
  item: RawQuoteItemForEnrichment,
  pricingModel: string | null,
  meta: {
    tier_label: string | null;
    qty_label: string | null;
    display_order: number | null;
  } | null,
): ServicesSummaryItem {
  return {
    service_id: item.service_id,
    service_name: item.item_name,
    service_pricing_model: pricingModel,
    tier_name: item.tier_name,
    tier_label: meta?.tier_label ?? null,
    qty_label: meta?.qty_label ?? null,
    quantity: item.quantity,
    unit_price: Number(item.unit_price),
    total_price:
      item.total_price != null ? Number(item.total_price) : undefined,
    display_order: meta?.display_order ?? undefined,
  };
}
