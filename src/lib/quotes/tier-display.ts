/**
 * D45 (Issue 41 audit Option U) — low-level tier token rendering for a
 * single quote_item.
 *
 * Returns the human-readable tier token portion (without service name) for
 * one quote_item / appointment_service / transaction_item. Single source of
 * truth consumed by:
 *
 *   - `services-summary.ts` (high-level chip composer for SMS templates;
 *     Issue 39 D45 adoption).
 *   - The 15 per-line visual rendering surfaces inventoried by Issue 41
 *     (quote page, receipt page, pay page, PDF, admin/POS detail views,
 *     receipt-template thermal + HTML, appointment notify routes). Visual
 *     adoption ships in D46 (Session 2); this helper lands first so the
 *     API is locked.
 *
 * Per operator-locked decisions (D45, 2026-05-26):
 *   - qty=1 → tier_label (with titleCase(tier_name) fallback when label is
 *     null/empty).
 *   - qty>1 with qty_label → `${qty} ${pluralize(qty_label)}`.
 *   - qty>1 without qty_label → defensive fallback
 *     `${qty} × ${tier_label || titleCase(tier_name)}` plus a console.warn
 *     so misconfiguration surfaces in logs. Branch is unreachable in
 *     production today — D43 Session C validates `quantity <= max_qty`
 *     server-side and max_qty is only set on tiers that also carry
 *     qty_label — but this defensive shape protects future operator edits
 *     that add max_qty without qty_label via the admin UI.
 *   - tier_name === 'default' → returns null (sentinel for the
 *     synthesized rows that `picker-engine.ts` emits for flat / per_unit /
 *     custom services that have no real tier row).
 *   - tier_name null/empty → returns null (no tier to display).
 *
 * Caller convention: wrap the returned string in the surface-appropriate
 * presentation. Conditional render is `{token && <span>…</span>}` — when
 * the helper returns null, the surface renders no tier sub-element.
 *
 * Pure. No I/O. No surface knowledge. No HTML, no PDF, no markdown.
 *
 * See `docs/dev/ISSUE_39_SERVICES_CHIP_AUDIT.md` Target 3 (Option X) and
 * `docs/dev/ISSUE_41_TIER_VISUAL_SURFACES_AUDIT.md` Target 7 (Option U)
 * for the full design rationale.
 */

export interface TierDisplayItem {
  /** Persisted tier slug from quote_items / appointment_services /
   * transaction_items. 'default' is a synthesized sentinel for
   * non-tiered pricing models — returns null. */
  tier_name: string | null;
  /** Operator-curated human-readable label from service_pricing. Joined
   * by callers via batched lookup keyed on (service_id, tier_name). */
  tier_label?: string | null;
  /** Operator-configured unit noun (e.g., 'row') from service_pricing.
   * Only meaningful when quantity > 1. */
  qty_label?: string | null;
  /** Resolved positive integer from quote_items.quantity / appointment
   * services / transaction items. Defaults to 1 when omitted. */
  quantity?: number;
}

/**
 * Render the tier token for a single item.
 * Returns null when no meaningful tier display is warranted.
 */
export function renderTierToken(item: TierDisplayItem): string | null {
  const quantity = item.quantity ?? 1;

  // No tier configured (flat pricing, default sentinel) → nothing to render.
  if (!item.tier_name || item.tier_name === 'default') {
    return null;
  }

  // qty > 1 with qty_label configured → "${qty} ${pluralize(qty_label)}".
  if (quantity > 1 && item.qty_label) {
    return `${quantity} ${capitalize(pluralize(item.qty_label))}`;
  }

  // Defensive: qty > 1 without qty_label. Unreachable in production today
  // (D43 max_qty validation gates qty>1 to tiers with qty_label) but
  // protects against future admin-UI misconfiguration.
  if (quantity > 1) {
    const fallbackLabel = item.tier_label || titleCase(item.tier_name);
    console.warn(
      `[tier-display] qty>1 (${quantity}) but qty_label is null/missing for tier="${item.tier_name}"; ` +
        `falling back to "${quantity} × ${fallbackLabel}"`,
    );
    return `${quantity} × ${fallbackLabel}`;
  }

  // qty = 1: tier_label with titleCase(tier_name) fallback.
  return item.tier_label || titleCase(item.tier_name);
}

/**
 * Simple English pluralization. No npm dependency — the catalog is
 * operator-controlled and small. `+es` for nouns ending in s / x / z /
 * ch / sh (case-insensitive); `+s` for everything else.
 * Future irregulars (foot → feet, etc.) added as encountered.
 */
function pluralize(noun: string): string {
  return /(?:s|x|z|ch|sh)$/i.test(noun) ? noun + 'es' : noun + 's';
}

/**
 * snake_case → Title Case. Used as a fallback when tier_label is
 * null/empty so legacy data (or operator omissions) still produce a
 * readable surface label rather than the raw slug.
 *
 * "floor_mats" → "Floor Mats"
 * "per_row" → "Per Row"
 * "touring_bagger" → "Touring Bagger"
 */
function titleCase(snake: string): string {
  return snake
    .split('_')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Capitalize first letter only — used to title-case pluralized qty_label
 * tokens ("rows" → "Rows") without disturbing the rest of the word. */
function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
