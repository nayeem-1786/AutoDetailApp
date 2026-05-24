import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Issue 33 Layer 1 — server-side combo-pricing application across the
 * quote-creation paths used by SMS-AI v2, the ElevenLabs voice agent,
 * the Twilio inbound auto-quote, voice-post-call finalize, and the
 * public online booking form.
 *
 * Mirrors the POS quote-reducer's "lowest wins" semantic
 * (`src/app/pos/context/quote-reducer.ts:182-188`) but operates on a
 * pre-resolved item set rather than per-item ADD actions. Detection is
 * the load-bearing new piece: agent paths receive a flat service list
 * with no add-time UI binding, so we read `service_addon_suggestions`
 * and apply combos when both the anchor and addon are in the quote.
 *
 * Exports:
 * - `applyCombosFromSuggestions` — pure function, unit-testable.
 * - `applyCombosToQuoteItems`    — admin-injected wrapper, the one-line
 *                                  API for quote-creation paths.
 * - `isComboInSeason`            — seasonal-window predicate, exported
 *                                  for future reuse from the 2 existing
 *                                  duplicated sites
 *                                  (voice-agent/services/route.ts:111-118
 *                                  and pos/hooks/use-addon-suggestions.ts:53-56).
 */

// Reuse the auto-generated type — see database.types.ts:4753.
export type ServiceAddonSuggestion =
  Database['public']['Tables']['service_addon_suggestions']['Row'];

export interface ResolvedQuoteItem {
  service_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  tier_name: string | null;
  standard_price: number | null;
  pricing_type: 'standard' | 'sale' | 'combo' | null;
}

export interface ComboResolverOptions {
  /**
   * "lowest wins" — combo applies only when `combo_price <= item.unit_price`
   * (which may itself be a sale price). Mirrors the POS reducer policy at
   * `quote-reducer.ts:182-188`. Default: true. Set false to force combo
   * regardless of whether a lower sale price is already in effect.
   */
  lowestWins?: boolean;
  /**
   * When an addon has multiple potential anchors that are ALL in the quote
   * (e.g. addon X bundles with both A and B), pick the lowest `combo_price`
   * or the first match in suggestions iteration order. Mirrors operator
   * answer to Q1: lowest combo_price wins.
   */
  multipleAnchorTiebreak?: 'lowest_price' | 'first_match';
  /**
   * Override "today" for seasonal-window checks. Test seam. Default: `new Date()`.
   */
  today?: Date;
}

/**
 * Returns true when the combo's seasonal window includes `today`.
 *
 * - `is_seasonal === false` → always in season.
 * - `is_seasonal === true`  → today must satisfy
 *   `(seasonal_start is null OR today >= seasonal_start) AND
 *    (seasonal_end is null OR today <= seasonal_end)`.
 *
 * Date semantics match the existing voice-agent/services/route.ts:111-118
 * implementation: ISO-date strings are coerced via `new Date(...)` (UTC
 * midnight for date-only strings), then compared against `today`.
 */
export function isComboInSeason(
  suggestion: Pick<
    ServiceAddonSuggestion,
    'is_seasonal' | 'seasonal_start' | 'seasonal_end'
  >,
  today: Date,
): boolean {
  if (!suggestion.is_seasonal) return true;
  if (suggestion.seasonal_start) {
    const start = new Date(suggestion.seasonal_start);
    if (today < start) return false;
  }
  if (suggestion.seasonal_end) {
    const end = new Date(suggestion.seasonal_end);
    if (today > end) return false;
  }
  return true;
}

/**
 * PURE: apply combo pricing across a resolved quote-item list given
 * pre-fetched suggestion rows. Does NOT mutate `items`.
 *
 * Each item whose `service_id` appears as an `addon_service_id` in any
 * eligible suggestion AND whose corresponding `primary_service_id` is
 * ALSO in the item set is a combo candidate. Among multiple candidates
 * for the same addon, the winning combo is chosen per
 * `multipleAnchorTiebreak` (default: lowest `combo_price`).
 *
 * "lowest wins" gate (default): only apply if `combo_price <= item.unit_price`.
 */
export function applyCombosFromSuggestions(
  items: ResolvedQuoteItem[],
  suggestions: readonly ServiceAddonSuggestion[],
  options: ComboResolverOptions = {},
): ResolvedQuoteItem[] {
  if (items.length === 0) return items;
  if (suggestions.length === 0) return [...items];

  const {
    lowestWins = true,
    multipleAnchorTiebreak = 'lowest_price',
    today = new Date(),
  } = options;

  const serviceIdSet = new Set<string>(items.map((i) => i.service_id));

  // Build addon → eligible suggestions map. A suggestion is eligible when:
  //  - auto_suggest is true
  //  - it is in season today
  //  - both the anchor (primary_service_id) and addon (addon_service_id)
  //    are in the item set
  //  - combo_price is a non-null positive number (defensive: schema allows null)
  const eligibleByAddon = new Map<string, ServiceAddonSuggestion[]>();
  for (const s of suggestions) {
    if (s.auto_suggest !== true) continue;
    if (!isComboInSeason(s, today)) continue;
    if (!serviceIdSet.has(s.primary_service_id)) continue;
    if (!serviceIdSet.has(s.addon_service_id)) continue;
    if (s.combo_price == null || Number(s.combo_price) <= 0) continue;

    const list = eligibleByAddon.get(s.addon_service_id);
    if (list) list.push(s);
    else eligibleByAddon.set(s.addon_service_id, [s]);
  }

  if (eligibleByAddon.size === 0) return [...items];

  return items.map((item) => {
    const matches = eligibleByAddon.get(item.service_id);
    if (!matches || matches.length === 0) return item;

    // Tiebreak: pick the winning suggestion. lowest_price = smallest combo_price.
    // first_match  = iteration order of suggestions input.
    let winner: ServiceAddonSuggestion;
    if (multipleAnchorTiebreak === 'first_match') {
      winner = matches[0];
    } else {
      winner = matches[0];
      for (let i = 1; i < matches.length; i++) {
        const candidate = matches[i];
        if (Number(candidate.combo_price) < Number(winner.combo_price)) {
          winner = candidate;
        }
      }
    }

    const comboPrice = Number(winner.combo_price);

    if (lowestWins && comboPrice > item.unit_price) {
      return item;
    }

    return {
      ...item,
      unit_price: comboPrice,
      standard_price: item.unit_price,
      pricing_type: 'combo',
    };
  });
}

/**
 * Admin-injected wrapper: fetches the relevant suggestion rows from
 * `service_addon_suggestions` and delegates to
 * `applyCombosFromSuggestions`.
 *
 * One-line API for quote-creation paths:
 *
 *   quoteItems = await applyCombosToQuoteItems(admin, quoteItems);
 *
 * Failure mode: the caller decides. This wrapper does NOT swallow DB
 * errors — if the suggestions query fails, the throw propagates so the
 * caller can choose to abort, fall back, or log+continue. (Today every
 * caller wraps the quote-creation pipeline in its own try/catch, so the
 * standard outcome is a 500 — matching existing behavior on any prior
 * step in those pipelines.)
 */
export async function applyCombosToQuoteItems(
  admin: SupabaseClient<Database>,
  items: ResolvedQuoteItem[],
  options: ComboResolverOptions = {},
): Promise<ResolvedQuoteItem[]> {
  if (items.length === 0) return items;

  const serviceIds = Array.from(
    new Set(items.map((i) => i.service_id).filter((id): id is string => !!id)),
  );
  if (serviceIds.length === 0) return [...items];

  const { data, error } = await admin
    .from('service_addon_suggestions')
    .select('*')
    .in('primary_service_id', serviceIds)
    .in('addon_service_id', serviceIds)
    .eq('auto_suggest', true);

  if (error) {
    throw new Error(
      `applyCombosToQuoteItems: failed to fetch service_addon_suggestions — ${error.message}`,
    );
  }

  return applyCombosFromSuggestions(items, data ?? [], options);
}
