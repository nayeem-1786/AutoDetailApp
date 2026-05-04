// Refund source-plan parser + enricher.
//
// Session 4d's refund engine writes a JSON breakdown into `refunds.notes`
// whenever a refund spans more than one source (split tender on a single
// transaction OR close-out walking sibling transactions on the same
// appointment). The shape:
//   { "sources": [ { transaction_id, method, amount, stripe_pi, stripe_refund_id }, ... ] }
//
// Older single-source refunds and refunds whose `notes` contains free-text
// (legacy reason text) leave `notes` non-JSON; the parser returns null for
// those and rendering surfaces simply skip the per-method block.
//
// Card sources carry `stripe_pi` but not `card_brand` / `card_last_four` — the
// engine doesn't replicate those onto the source entry. Surfaces that want to
// render "Card (Visa ****8085)" pass a payments[] lookup to enrichRefundSources
// and the helper joins by stripe_payment_intent_id. When the lookup misses
// (e.g. close-out source on a sibling tx whose payments aren't joined locally),
// the source returns un-enriched and the renderer falls back to plain "Card".

export interface RawRefundSource {
  transaction_id: string;
  method: string;
  amount: number;
  stripe_pi: string | null;
  stripe_refund_id: string | null;
}

export interface RefundSource extends RawRefundSource {
  card_brand?: string | null;
  card_last_four?: string | null;
}

export interface PaymentLookupRow {
  stripe_payment_intent_id?: string | null;
  card_brand?: string | null;
  card_last_four?: string | null;
}

/**
 * Parse a refunds.notes string into structured source entries. Returns null
 * for null/empty/non-JSON/legacy free-text values so callers can hide the
 * per-method block without try/catch noise.
 */
export function parseRefundSources(
  notes: string | null | undefined
): RawRefundSource[] | null {
  if (!notes || typeof notes !== 'string') return null;
  const trimmed = notes.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const sources = Array.isArray(parsed)
    ? parsed
    : (parsed as { sources?: unknown } | null)?.sources;
  if (!Array.isArray(sources)) return null;

  const out: RawRefundSource[] = [];
  for (const raw of sources) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const method = typeof s.method === 'string' ? s.method : null;
    const amount =
      typeof s.amount === 'number' ? s.amount : Number(s.amount);
    if (!method || !Number.isFinite(amount)) continue;
    out.push({
      transaction_id:
        typeof s.transaction_id === 'string' ? s.transaction_id : '',
      method,
      amount,
      stripe_pi: typeof s.stripe_pi === 'string' ? s.stripe_pi : null,
      stripe_refund_id:
        typeof s.stripe_refund_id === 'string' ? s.stripe_refund_id : null,
    });
  }
  return out.length > 0 ? out : null;
}

/**
 * Join parsed sources against a payments[] list to attach card_brand /
 * card_last_four for card-method sources. Cash sources pass through. Card
 * sources whose stripe_pi has no match pass through with brand/last_four
 * undefined — renderers handle the fallback.
 */
export function enrichRefundSources(
  raw: RawRefundSource[],
  payments: PaymentLookupRow[] | null | undefined
): RefundSource[] {
  const piIndex = new Map<string, PaymentLookupRow>();
  for (const p of payments ?? []) {
    if (p?.stripe_payment_intent_id) {
      piIndex.set(p.stripe_payment_intent_id, p);
    }
  }
  return raw.map((s) => {
    if (s.method !== 'card' || !s.stripe_pi) return { ...s };
    const match = piIndex.get(s.stripe_pi);
    if (!match) return { ...s };
    return {
      ...s,
      card_brand: match.card_brand ?? null,
      card_last_four: match.card_last_four ?? null,
    };
  });
}

/**
 * Convenience: parse + enrich in one shot. Returns null when nothing parses.
 */
export function buildRefundSources(
  notes: string | null | undefined,
  payments: PaymentLookupRow[] | null | undefined
): RefundSource[] | null {
  const raw = parseRefundSources(notes);
  if (!raw) return null;
  return enrichRefundSources(raw, payments);
}

/**
 * Truncate a Stripe refund id to a compact tag (e.g. "re_3TTFysE…").
 * Used on POS transaction-detail and HTML email receipts where staff /
 * operator need the reconciliation handle but the full 27+ char id is
 * visually noisy.
 */
export function shortStripeRefundId(id: string | null | undefined): string | null {
  if (!id || typeof id !== 'string') return null;
  if (id.length <= 12) return id;
  return `${id.slice(0, 11)}…`;
}
