/**
 * Path B Session 3 (Session #142, 2026-06-02 — Vehicle Classifier
 * Restoration / C1 architectural refactor). Browser-side wrapper that
 * routes the classifier through the new public `/api/classify-vehicle`
 * endpoint instead of calling `resolveVehicleClassification` with a
 * browser-side Supabase client. The browser path fails for anonymous
 * customers because the `vehicle_makes` RLS policy
 * (`supabase/migrations/20260223000001_create_vehicle_makes.sql`) only
 * grants SELECT to `authenticated`; routing through the API endpoint
 * lets the server use the admin client (RLS bypassed) so the same
 * classifier runs uniformly regardless of whether the caller is
 * anonymous or authenticated.
 *
 * **Architectural shape (Q-1 LOCKED Option B):** the canonical
 * classifier `resolveVehicleClassification` in `./vehicle-categories.ts`
 * stays unchanged at its parameter-injection signature — server-side
 * callers (POS at `/api/pos/customers/[id]/vehicles`, voice agent at
 * `/api/voice-agent/vehicle-classify`, customer portal POST/PATCH at
 * `/api/customer/vehicles{,/[id]}`) continue to call it directly with
 * their own admin client. Browser-side callers go through this
 * wrapper, which calls the same canonical function on the server.
 * **One classifier function, one canonical execution path** — server.
 *
 * **Why a thin wrapper instead of inlining `fetch()` at each call
 * site:** Memory #2 — the wrapper encapsulates the URL construction,
 * S1 telemetry (`console.warn` on `classifier_reason='query_failed'`),
 * and error normalization in one place. Browser callers `step-vehicle.tsx`
 * + `vehicle-form-dialog.tsx` then call a single function with a
 * uniform signature.
 *
 * **Signature parity with `resolveVehicleClassification`:** same args
 * (`make`, optional `model`, optional `year`), same return type
 * (`VehicleClassification`). The classifier's parameter-injection
 * `supabase` argument is the lone difference — the wrapper doesn't
 * need it because the server does the DB access.
 *
 * **Error handling:** the wrapper does NOT throw on classifier
 * `query_failed` — that's a non-confident result, structurally the
 * same shape as `no_match`. Both fall through to
 * `category_confident: false` and the caller defaults to whatever
 * the user picked. The wrapper DOES throw on network errors (fetch
 * rejected) and non-2xx HTTP responses, so the caller's existing
 * try/catch around the classifier still handles infrastructure
 * failures uniformly.
 *
 * **S1 telemetry:** on `classifier_reason === 'query_failed'` the
 * wrapper emits `console.warn` with caller context so production
 * surfaces (and dev devtools) record the failure mode. RLS-denial
 * pre-C1 was invisible — post-C1 fix this shouldn't fire in normal
 * use, but the telemetry guards against regressions (e.g., if a
 * future schema change re-introduces a query failure).
 */

import type { VehicleClassification } from './vehicle-categories';

/**
 * Defensive timeout for the classifier fetch. The classifier query is
 * a sub-second operation in normal conditions; 10 seconds is the
 * upper bound where "still working" stops being plausible and
 * "infrastructure broken" becomes the operative explanation.
 *
 * **Why the timeout exists (T9 contract requirement, Session #142):**
 * the audit's regression-locking test pattern requires that
 * `setClassifying(false)` fires within a bounded time across all
 * five classifier failure modes — including the "fetch never
 * resolves" case (server hang, network black-hole, etc.). Without
 * this timeout the spinner-lifecycle contract has no upper bound and
 * the production stuck-spinner bug class can technically recur. The
 * AbortController fires after `CLASSIFIER_TIMEOUT_MS`, the fetch
 * rejects with an AbortError, the caller's existing try/catch
 * handles it normally → spinner clears.
 *
 * 10s is generous enough that real classifier responses never trip
 * it (sub-second in normal conditions) and short enough that a hung
 * request doesn't trap a customer mid-booking.
 */
export const CLASSIFIER_TIMEOUT_MS = 10_000;

/**
 * Browser-side classifier. Resolves to a `VehicleClassification`
 * identical in shape to what server-side callers get from
 * `resolveVehicleClassification` — but the DB query runs server-side
 * under the admin client (RLS-bypassed), so anonymous browsers can
 * call this without hitting the `vehicle_makes` RLS denial.
 *
 * **Bounded** by `CLASSIFIER_TIMEOUT_MS` (10 seconds): if the fetch
 * never resolves, the AbortController fires and the promise rejects
 * with an Error. Caller's try/catch handles it. Spinner clears.
 *
 * Throws on network/HTTP failures + timeout (caller's existing
 * try/catch handles these); does NOT throw on classifier
 * non-confident results (those are returned as normal
 * `VehicleClassification` with `category_confident: false` +
 * `classifier_reason` set).
 */
export async function classifyVehicleClient(
  make: string,
  model?: string,
  year?: number
): Promise<VehicleClassification> {
  const params = new URLSearchParams();
  params.set('make', make);
  if (model) params.set('model', model);
  if (year != null) params.set('year', String(year));

  // T9 defensive timeout — see CLASSIFIER_TIMEOUT_MS comment.
  // AbortController is universally available in modern browsers + Node 16+;
  // setTimeout-based abort is portable across environments where
  // `AbortSignal.timeout()` (newer) may not be polyfilled.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`/api/classify-vehicle?${params.toString()}`, {
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    // Surface AbortError as a typed Error the caller's catch can log
    // distinctly from generic fetch failures.
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Classifier timeout after ${CLASSIFIER_TIMEOUT_MS}ms — server unreachable or slow`);
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    // 400 = missing make (programmer error in caller). 5xx = server
    // failure. Either way, caller's try/catch handles it. Wrap the
    // body's `error` field if present.
    const body: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(
      body?.error || `Classifier endpoint failed: ${res.status} ${res.statusText}`
    );
  }

  const body: { classification: VehicleClassification } = await res.json();
  const classification = body.classification;

  // S1 telemetry — surface RLS-denial / query-failure regressions in
  // production via console.warn. `no_match` is a legitimate operator
  // outcome (typo, taxonomy gap) and stays quiet. Post-C1 fix
  // `query_failed` shouldn't appear at all in normal operation; if
  // it does, the operator's browser devtools record it.
  if (classification.classifier_reason === 'query_failed') {
    console.warn(
      `[classifyVehicleClient] classifier reported query_failed for make="${make}"${model ? ` model="${model}"` : ''} — defaulting to automobile + category_confident=false. ` +
      `If this fires in production post-C1 refactor, investigate the /api/classify-vehicle endpoint or vehicle_makes table health.`
    );
  }

  return classification;
}
