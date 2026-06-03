import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveVehicleClassification } from '@/lib/utils/vehicle-categories';

/**
 * GET /api/classify-vehicle — Public vehicle classifier endpoint.
 *
 * Path B Session 3 (Session #142, 2026-06-02 — Vehicle Classifier
 * Restoration / C1 architectural refactor). Closes the production
 * incident from `docs/dev/VEHICLE_CLASSIFIER_BEHAVIOR_AUDIT.md`
 * (5e3d3388) where the `/book` Step 1 "Add a New Vehicle" path
 * silently failed for anonymous customers because the classifier was
 * called from the browser client, which is subject to the
 * `vehicle_makes` RLS policy that only grants SELECT to
 * `authenticated`. Anonymous booking customers (everyone pre-Step-4)
 * hit RLS denial: either silent empty fall-through (classifier
 * defaults to automobile + category_confident=false) OR a literal
 * stuck spinner on the auth-token refresh hang.
 *
 * **Architectural choice (Q-1 LOCKED Option B):** the classifier's
 * single DB query (`vehicle_makes` Layer-1 lookup at
 * `vehicle-categories.ts:746-750`) MUST execute server-side under
 * the admin (service-role) client, which bypasses RLS. Layers 2-5
 * (automobile size_class hints, exotic, classic) run on hardcoded
 * constants and don't need DB access — they execute server-side too
 * for cohesion, but they'd work client-side without harm.
 *
 * **Why a dedicated endpoint instead of extending `/api/vehicle-makes`:**
 * `/api/vehicle-makes` returns the FULL filtered list of makes for
 * the combobox (one row per make, filtered by category). The
 * classifier needs a single make→classification lookup, which is a
 * different query shape and a different response shape (a single
 * `VehicleClassification` object, not an array). Mirroring the
 * existing pattern (public GET with admin client; mirrors
 * `src/app/api/vehicle-makes/route.ts`) instead of fusing two
 * unrelated concerns into one endpoint.
 *
 * **Query params (all optional except `make`):**
 *   - `make` (required): vehicle make string. Empty/whitespace → 400.
 *   - `model` (optional): vehicle model string. Used by Layers 1
 *     disambiguation (dual-category makes) + 2 (automobile size
 *     hints) + 4 (exotic model patterns) + 5 (classic curated list).
 *   - `year` (optional): integer year. Used by Layer 5 (classic
 *     threshold).
 *
 * **Response (200):** `{ classification: VehicleClassification }`.
 * Classification shape documented in
 * `src/lib/utils/vehicle-categories.ts:645-688`. Includes the
 * `classifier_reason` field added in S1 (Session #142) for telemetry
 * — non-null when the classifier hit a non-confident path
 * (`'query_failed'` or `'no_match'`); null/undefined on confident
 * results.
 *
 * **Errors:**
 *   - 400 `make is required` if the make param is missing/empty
 *
 * **Public + anonymous:** no auth required. Mirrors
 * `/api/vehicle-makes`'s public-anonymous posture — vehicle makes
 * are public knowledge (already visible in the combobox to anon
 * users), and the classifier's job is to map that public knowledge
 * to a public categorization. No PII exposure.
 *
 * **Browser-side caller:** `src/lib/utils/classify-vehicle-client.ts`
 * (`classifyVehicleClient`) wraps this endpoint via `fetch()`.
 * Public-booking Step-1 (`step-vehicle.tsx`) + customer portal
 * vehicle form (`vehicle-form-dialog.tsx`) both route through that
 * wrapper rather than calling `resolveVehicleClassification`
 * directly.
 *
 * **Server-side callers** (POS, voice agent, customer portal
 * POST/PATCH) continue to call `resolveVehicleClassification`
 * directly with their own admin client — those paths never went
 * through the browser and aren't affected by RLS.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const make = (searchParams.get('make') ?? '').trim();
  const model = searchParams.get('model')?.trim() || undefined;
  const yearParam = searchParams.get('year')?.trim();
  const year = yearParam ? parseInt(yearParam, 10) || undefined : undefined;

  if (!make) {
    return NextResponse.json(
      { error: 'make is required' },
      { status: 400 }
    );
  }

  // Admin client bypasses RLS — the whole point of moving the
  // classifier behind this endpoint. The `vehicle_makes` policy
  // (`FOR SELECT TO authenticated USING (true)`) doesn't apply to
  // the service role.
  const admin = createAdminClient();
  const classification = await resolveVehicleClassification(
    admin,
    make,
    model,
    year
  );

  return NextResponse.json({ classification });
}
