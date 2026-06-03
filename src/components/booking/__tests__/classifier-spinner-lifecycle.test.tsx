/**
 * T9 (Session #142, 2026-06-02 — Vehicle Classifier Restoration,
 * Path B Session 3) — regression-locking contract test for the
 * classifier spinner lifecycle on public-booking Step 1.
 *
 * **Contract:** for ANY classifier outcome — confident success,
 * non-confident success (no_match / query_failed), thrown error,
 * even a fetch that never resolves — `setClassifying(true)` MUST
 * be followed by `setClassifying(false)` within a bounded time so
 * the spinner clears and the user can proceed (or be informed and
 * recover).
 *
 * The audit (`VEHICLE_CLASSIFIER_BEHAVIOR_AUDIT.md`, 5e3d3388)
 * identified that the pre-#142 implementation could leave the
 * spinner stuck in two cases: (1) `classifyVehicleClient`'s
 * predecessor `resolveVehicleClassification(browserSupabase, …)`
 * silently swallowed Supabase's `error` field, so RLS-denied
 * queries appeared as zero-row matches and the form looked broken
 * downstream; (2) the same predecessor had no bounded timeout, so
 * a hung fetch held the spinner forever. The #142 architectural
 * refactor (C1) routes through `/api/classify-vehicle` with admin
 * client (RLS bypassed) AND adds `CLASSIFIER_TIMEOUT_MS` (10s) to
 * the wrapper. This test locks both properties: the spinner-
 * lifecycle contract becomes structurally inviolable.
 *
 * **Five failure-mode scenarios** (mirrors `vehicle-forms-reset-
 * contract.test.tsx`'s structural-guard pattern from #136 T8):
 *   1. **Success** — fetch resolves with confident result; spinner
 *      clears after `await` returns.
 *   2. **no_match** — fetch resolves with non-confident result +
 *      `classifier_reason: 'no_match'` (Layer-1 found zero matching
 *      makes). Spinner clears identically; UI defaults gracefully.
 *   3. **query_failed** — fetch resolves with non-confident result +
 *      `classifier_reason: 'query_failed'` (Layer-1 query errored).
 *      Spinner clears + `console.warn` fires (S1 telemetry).
 *   4. **Throw / HTTP 500** — fetch resolves with non-2xx response;
 *      the wrapper throws; classify()'s catch fires → spinner clears.
 *   5. **Never resolve** — fetch returns a Promise that never resolves;
 *      `CLASSIFIER_TIMEOUT_MS` AbortController fires; the wrapper
 *      throws "Classifier timeout…"; classify()'s catch fires →
 *      spinner clears. **This is the production stuck-spinner case.**
 *
 * Each scenario uses `vi.useFakeTimers()` to advance time
 * deterministically through the 400ms debounce + (for #5) the
 * 10-second classifier timeout. Asserts the spinner is gone via
 * `aria-busy={false}` on the height-reserved container in
 * `step-vehicle.tsx`.
 *
 * **Anti-regression contract:** if any future refactor removes
 * the timeout from `classify-vehicle-client.ts`, or breaks the
 * lifecycle pairing in `step-vehicle.tsx`'s `classify()` catch/
 * finally blocks, scenario 5 (or one of the other four) will
 * fail. Single source of truth for the spinner contract.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { StepVehicle } from '../step-vehicle';
import type { VehicleClassification } from '@/lib/utils/vehicle-categories';

// ───────────────────────────────────────────────────────────────
// Mocks — fetch (the wrapper's transport) + the make combobox
// (the combobox uses its own /api/vehicle-makes fetch which we
// stub independently)
// ───────────────────────────────────────────────────────────────

// We mock the make combobox to render a plain <input> so the test
// can drive the make-change pipeline with a deterministic
// fireEvent.change. The real combobox uses a popover with async
// keyboard nav which isn't relevant to the spinner lifecycle.
vi.mock('@/components/ui/vehicle-make-combobox', async () => {
  const actual = await vi.importActual<typeof import('@/components/ui/vehicle-make-combobox')>(
    '@/components/ui/vehicle-make-combobox'
  );
  return {
    ...actual,
    VehicleMakeCombobox: ({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) => (
      <input
        id={id}
        data-testid="mock-make-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    ),
  };
});

// Confetti would otherwise pin the event loop with its 10s animation
// timer; nothing in StepVehicle uses confetti directly, but the
// imports may chain. Defensive mock for safety.
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

const fetchSpy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchSpy.mockReset();
  global.fetch = fetchSpy as unknown as typeof fetch;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

function confidentClassification(): VehicleClassification {
  return {
    vehicle_category: 'automobile',
    vehicle_type: 'standard',
    size_class: 'sedan',
    specialty_tier: null,
    seat_rows: 2,
    needs_year_confirmation: false,
    category_confident: true,
  };
}

function nonConfidentClassification(reason: 'no_match' | 'query_failed'): VehicleClassification {
  return {
    vehicle_category: 'automobile',
    vehicle_type: 'standard',
    size_class: 'sedan',
    specialty_tier: null,
    seat_rows: 2,
    needs_year_confirmation: false,
    category_confident: false,
    classifier_reason: reason,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function renderAndType(make: string): Promise<void> {
  render(
    <StepVehicle
      customerData={null}
      onContinue={vi.fn()}
      initialVehicle={null}
    />
  );
  const input = screen.getByTestId('mock-make-input') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { value: make } });
  });
}

function spinnerSlot(): HTMLElement {
  // The height-reserved spinner container at step-vehicle.tsx is
  // labeled with aria-live="polite" and toggles aria-busy on the
  // `classifying` state. We read aria-busy as the contract signal.
  const container = document.querySelector('[aria-busy][aria-live="polite"]');
  if (!container) throw new Error('Spinner container not found in DOM');
  return container as HTMLElement;
}

async function advancePastDebounceAndAwait(): Promise<void> {
  // Advance past the 400ms debounce + microtasks.
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function advancePastTimeout(): Promise<void> {
  // Advance past the 10s CLASSIFIER_TIMEOUT_MS.
  await act(async () => {
    vi.advanceTimersByTime(10_100);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

// ───────────────────────────────────────────────────────────────
// Scenario 1 — confident success
// ───────────────────────────────────────────────────────────────

describe('T9 contract — spinner lifecycle: confident success', () => {
  it('clears spinner after confident classifier result', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ classification: confidentClassification() }));

    await renderAndType('Honda');
    await advancePastDebounceAndAwait();

    await waitFor(() => {
      expect(spinnerSlot().getAttribute('aria-busy')).toBe('false');
    });
  });
});

// ───────────────────────────────────────────────────────────────
// Scenario 2 — non-confident no_match
// ───────────────────────────────────────────────────────────────

describe('T9 contract — spinner lifecycle: no_match', () => {
  it('clears spinner when classifier returns no_match', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ classification: nonConfidentClassification('no_match') }));

    await renderAndType('ZyxqUnknownMake');
    await advancePastDebounceAndAwait();

    await waitFor(() => {
      expect(spinnerSlot().getAttribute('aria-busy')).toBe('false');
    });
  });
});

// ───────────────────────────────────────────────────────────────
// Scenario 3 — non-confident query_failed (S1 telemetry path)
// ───────────────────────────────────────────────────────────────

describe('T9 contract — spinner lifecycle: query_failed', () => {
  it('clears spinner when classifier returns query_failed and fires S1 console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchSpy.mockResolvedValue(jsonResponse({ classification: nonConfidentClassification('query_failed') }));

    await renderAndType('Honda');
    await advancePastDebounceAndAwait();

    await waitFor(() => {
      expect(spinnerSlot().getAttribute('aria-busy')).toBe('false');
    });

    // S1 telemetry: warn must mention query_failed + the make for
    // post-incident diagnosis (operator devtools record this).
    expect(warnSpy).toHaveBeenCalled();
    const warnCall = warnSpy.mock.calls.find((c) =>
      typeof c[0] === 'string' && c[0].includes('query_failed') && c[0].includes('Honda')
    );
    expect(warnCall).toBeTruthy();

    warnSpy.mockRestore();
  });
});

// ───────────────────────────────────────────────────────────────
// Scenario 4 — HTTP 500 / thrown error
// ───────────────────────────────────────────────────────────────

describe('T9 contract — spinner lifecycle: HTTP error', () => {
  it('clears spinner when fetch returns non-2xx (wrapper throws)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ error: 'Internal Server Error' }, 500));

    await renderAndType('Honda');
    await advancePastDebounceAndAwait();

    await waitFor(() => {
      expect(spinnerSlot().getAttribute('aria-busy')).toBe('false');
    });
  });

  it('clears spinner when fetch itself rejects (network error)', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Network request failed'));

    await renderAndType('Honda');
    await advancePastDebounceAndAwait();

    await waitFor(() => {
      expect(spinnerSlot().getAttribute('aria-busy')).toBe('false');
    });
  });
});

// ───────────────────────────────────────────────────────────────
// Scenario 5 — never-resolve (THE PRODUCTION STUCK-SPINNER CASE)
// ───────────────────────────────────────────────────────────────

describe('T9 contract — spinner lifecycle: never-resolve (THE bug class)', () => {
  it('clears spinner via CLASSIFIER_TIMEOUT_MS abort when fetch never resolves', async () => {
    // The production bug pre-#142: fetch (or its predecessor direct-
    // Supabase query) hung indefinitely. The defensive timeout in
    // classify-vehicle-client.ts MUST fire and abort the fetch so the
    // spinner clears. If a future refactor removes the timeout, this
    // test fails — locking the contract.
    fetchSpy.mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        // Honor the AbortController so the timeout actually aborts.
        // If we ignored this, the test would hang waiting for a
        // promise that never settles, and vi's fake timers wouldn't
        // help. The real timeout in classify-vehicle-client.ts calls
        // `controller.abort()` on the AbortSignal; the fetch
        // implementation is expected to honor that signal by
        // rejecting with an AbortError.
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
        // Otherwise: never resolve.
      });
    });

    await renderAndType('Honda');
    await advancePastDebounceAndAwait();
    // At this point the fetch is in flight (will never resolve on its
    // own). Spinner is still on.
    expect(spinnerSlot().getAttribute('aria-busy')).toBe('true');

    // Advance past the 10s timeout. AbortController fires → fetch
    // rejects with AbortError → wrapper throws "Classifier timeout…"
    // → classify()'s catch + finally fire → spinner clears.
    await advancePastTimeout();

    await waitFor(() => {
      expect(spinnerSlot().getAttribute('aria-busy')).toBe('false');
    });
  });
});
