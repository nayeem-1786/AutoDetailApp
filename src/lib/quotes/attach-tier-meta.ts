/**
 * D46 (Issue 41) — tier-metadata attachment for visual surface adoption.
 *
 * Sibling helper to D45's `enrichItemsWithTierMeta` (in `services-summary.ts`).
 * Both share the same batched-fetch shape (one `service_pricing` IN query
 * keyed on the set of `service_id`s in the input items) but they differ in
 * RETURN SHAPE:
 *
 *   - `enrichItemsWithTierMeta` returns `ServicesSummaryItem[]` — a
 *     reshaped tuple designed to feed `formatServicesSummary` (the
 *     `{services}` chip composer). It DROPS surface-specific fields
 *     (notes, prerequisite_note, pricing_type, id, etc.) because the
 *     chip composer only needs name + tier + price.
 *
 *   - `attachTierMetaToItems` returns the ORIGINAL item shape with
 *     `tier_label` and `qty_label` MERGED IN. Every other field on the
 *     input row is preserved. This is what the 15 Issue 41 visual
 *     surfaces need — they render rich rows (id for React keys, notes,
 *     pricing_type for sale/combo badges, tax_amount for receipt
 *     columns, etc.) and want tier metadata layered on top, NOT a
 *     reshape.
 *
 * Adoption sites pass their existing items (`quote_items` row,
 * `transaction_items` row, `appointment_services` row) and get the same
 * items back annotated with the operator-curated tier presentation
 * fields. They then call `renderTierToken(item)` from
 * `@/lib/quotes/tier-display` at the render line.
 *
 * Error handling: matches `enrichItemsWithTierMeta` — failures are
 * logged via `console.warn` and the function returns items with
 * `tier_label`/`qty_label` unchanged (null/undefined). Rendering paths
 * stay best-effort; a transient DB hiccup must not break a receipt
 * print or quote PDF.
 *
 * NO changes to D45 helpers — they stay byte-identical. This file is a
 * pure additive helper that lives alongside them.
 *
 * See `docs/dev/ISSUE_41_TIER_VISUAL_SURFACES_AUDIT.md` Target 7 for
 * the architectural split rationale.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Minimum fields the adapter needs on each input item.
 *  Composite key into `service_pricing` is `(service_id, tier_name)`. */
export interface TierMetaInput {
  service_id?: string | null;
  tier_name?: string | null;
}

/** Tier-metadata fields the adapter merges onto each input item.
 *  Both optional so existing call sites can declare the output type as
 *  `T & TierMetaFields` without breaking when a row has no tier match. */
export interface TierMetaFields {
  tier_label?: string | null;
  qty_label?: string | null;
}

/**
 * Merge `tier_label` and `qty_label` from `service_pricing` onto every
 * input item using a single batched IN query.
 *
 * Items with null `service_id` or null `tier_name` pass through unchanged
 * (no `service_pricing` row exists for them). Items whose
 * `(service_id, tier_name)` pair does not match any row pass through
 * with the meta fields left null — `renderTierToken` falls back to
 * title-cased `tier_name` per its existing contract.
 *
 * Constant DB roundtrip count: one query regardless of item count.
 * Empty-items hot path: skips the DB call entirely.
 */
export async function attachTierMetaToItems<T extends TierMetaInput>(
  admin: SupabaseClient,
  items: T[],
): Promise<(T & TierMetaFields)[]> {
  if (items.length === 0) return [];

  const serviceIds = Array.from(
    new Set(
      items
        .map((i) => i.service_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );

  if (serviceIds.length === 0) {
    return items.map((i) => ({ ...i, tier_label: null, qty_label: null }));
  }

  let tierMeta = new Map<
    string,
    { tier_label: string | null; qty_label: string | null }
  >();

  try {
    const { data: tiers } = await admin
      .from('service_pricing')
      .select('service_id, tier_name, tier_label, qty_label')
      .in('service_id', serviceIds);

    if (tiers) {
      tierMeta = new Map(
        (
          tiers as Array<{
            service_id: string;
            tier_name: string;
            tier_label: string | null;
            qty_label: string | null;
          }>
        ).map((t) => [
          tierMetaKey(t.service_id, t.tier_name),
          { tier_label: t.tier_label, qty_label: t.qty_label },
        ]),
      );
    }
  } catch (err) {
    console.warn(
      '[attach-tier-meta] service_pricing lookup failed (non-blocking) —',
      err instanceof Error ? err.message : err,
    );
  }

  return items.map((item) => {
    if (!item.service_id || !item.tier_name) {
      return { ...item, tier_label: null, qty_label: null };
    }
    const meta = tierMeta.get(tierMetaKey(item.service_id, item.tier_name));
    return {
      ...item,
      tier_label: meta?.tier_label ?? null,
      qty_label: meta?.qty_label ?? null,
    };
  });
}

function tierMetaKey(serviceId: string, tierName: string): string {
  return `${serviceId}::${tierName}`;
}
