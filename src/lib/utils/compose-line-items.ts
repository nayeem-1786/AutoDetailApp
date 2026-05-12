// Phase Mobile-1.7 — display-only line-item composer for quotes and
// appointments.
//
// Why this exists: Phase Mobile-1 materialized a `mobile_fee` row into
// `transaction_items` so receipts (POS Copier, thermal, SMS, email)
// render a balanced item list. The parallel tables `quote_items` and
// `appointment_services` (and the `jobs.services` JSONB) were NOT given
// the same materialization — `quote_items` has no `item_type` column to
// hold a synthetic-row tag. Without it, quote PDFs / web pages / emails
// and the POS jobs detail breakdown loop the raw items and produce a
// line-item sum that does NOT equal the displayed subtotal (the mobile
// surcharge is on the parent record but never in the list).
//
// LOCKED-1 in Phase 1.7: composer-only fix. No schema change. The
// mobile_surcharge stays scalar on quotes/appointments; this helper
// appends a synthetic row at display time. Renderers loop the result;
// the synthetic row's `is_mobile_fee=true` flag is exported on the
// type so future renderers can style it differently if they want.

export interface DisplayLineItem {
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tier_name?: string | null;
  /**
   * True iff this row is the synthetic mobile-fee row appended by the
   * composer. False/undefined on every row that came from the raw items.
   * Stable contract — renderers may branch on this for visual treatment.
   */
  is_mobile_fee?: boolean;
}

/**
 * Source record carrying mobile-fee metadata. Both `quotes` and
 * `appointments` rows have these three columns (Phase Mobile-1 D2).
 * `mobile_surcharge` may arrive as a string from the DB numeric type —
 * `Number()`-coerced before comparison and use.
 */
export interface MobileFeeSource {
  is_mobile: boolean;
  mobile_surcharge: number | string | null;
  mobile_zone_name_snapshot: string | null;
}

/**
 * Raw item shape accepted by `composeLineItems`. Different upstreams use
 * different field names (`item_name` for `quote_items`, `name` for the
 * `jobs.services` JSONB and ad-hoc projections), so both are accepted.
 * Price fields can also arrive as strings from DB numeric types.
 */
export interface RawLineItem {
  item_name?: string | null;
  name?: string | null;
  quantity?: number | null;
  unit_price?: number | string | null;
  total_price?: number | string | null;
  tier_name?: string | null;
}

const FALLBACK_MOBILE_FEE_NAME = 'Mobile Service Fee';

/**
 * Compose a display-ready line-item array from a parent record and its
 * raw children. Maps each raw item to the `DisplayLineItem` shape and
 * appends a synthetic mobile-fee row at the END iff
 * `source.is_mobile === true` AND the surcharge is a positive finite
 * number. The synthetic row's name comes from
 * `source.mobile_zone_name_snapshot` (falls back to
 * `"Mobile Service Fee"` when null/empty).
 */
export function composeLineItems(
  source: MobileFeeSource,
  rawItems: RawLineItem[]
): DisplayLineItem[] {
  const items: DisplayLineItem[] = rawItems.map((raw) => {
    const unit = toFiniteNumber(raw.unit_price);
    const total = toFiniteNumber(raw.total_price);
    return {
      name: raw.item_name ?? raw.name ?? '',
      quantity: toFiniteNumber(raw.quantity, 1),
      unit_price: unit,
      total_price: total,
      tier_name: raw.tier_name ?? null,
    };
  });

  const surcharge = toFiniteNumber(source.mobile_surcharge);
  if (source.is_mobile === true && surcharge > 0) {
    const zone = (source.mobile_zone_name_snapshot ?? '').trim();
    items.push({
      name: zone || FALLBACK_MOBILE_FEE_NAME,
      quantity: 1,
      unit_price: surcharge,
      total_price: surcharge,
      tier_name: null,
      is_mobile_fee: true,
    });
  }

  return items;
}

function toFiniteNumber(input: unknown, fallback = 0): number {
  if (input === null || input === undefined || input === '') return fallback;
  const n = typeof input === 'number' ? input : Number(input);
  return Number.isFinite(n) ? n : fallback;
}
