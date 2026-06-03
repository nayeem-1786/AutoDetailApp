/**
 * Anti-regression contract test for the Step 1 classifier-output
 * application rules (Session #143, 2026-06-02 — Q-A.4 LOCKED
 * Option (iii), STEP1_SIZE_CLASS_AND_MUSTANG_CLASSIC_AUDIT.md).
 *
 * Locks the refined rule:
 *   - Classifier may pre-select size_class ONLY when detecting
 *     'exotic' or 'classic' (flow-routing to SpecialtyVehicleBlock).
 *   - For mundane classifier results (sedan / truck_suv_2row /
 *     suv_3row_van), the customer's manual pick is authoritative;
 *     classifier output is silently dropped from UI state.
 *   - For non-automobile categories (motorcycle / RV / boat /
 *     aircraft), the classifier's specialty_tier seed (always the
 *     smallest tier per Layer-3 manual-pick design) is silently
 *     dropped; customer manually picks.
 *
 * Companion to `classifier-spinner-lifecycle.test.tsx` (T9 from
 * #142) which locks the spinner lifecycle. This file locks the
 * spinner's PAYLOAD application — the spinner clears correctly via
 * T9; this file ensures the cleared classification is APPLIED
 * correctly per the refined rule.
 *
 * **Finding 2 coverage (year propagation):** the wrapper-side year
 * parameter is asserted via fetch URL inspection. Pre-Session #143
 * the call at `step-vehicle.tsx` dropped year silently, which broke
 * Layer 5 (classic) detection for Ford Mustang 1965 et al. The
 * combined-rule test below proves both fixes work together.
 *
 * Anti-regression contract: if a future refactor reintroduces the
 * classifier fallback to `effectiveSizeClass` for mundane sizes, OR
 * stops passing year through the wrapper, OR auto-seeds
 * non-automobile specialty_tier, the corresponding test fails.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { StepVehicle } from '../step-vehicle';
import type { VehicleClassification } from '@/lib/utils/vehicle-categories';

// ───────────────────────────────────────────────────────────────
// Mocks — mirror classifier-spinner-lifecycle.test.tsx exactly so
// the two suites can share rendering conditions deterministically.
// ───────────────────────────────────────────────────────────────

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

function classification(overrides: Partial<VehicleClassification>): VehicleClassification {
  return {
    vehicle_category: 'automobile',
    vehicle_type: 'standard',
    size_class: 'sedan',
    specialty_tier: null,
    seat_rows: 2,
    needs_year_confirmation: false,
    category_confident: true,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function renderStep(): Promise<void> {
  render(<StepVehicle customerData={null} onContinue={vi.fn()} initialVehicle={null} />);
}

async function typeMake(make: string): Promise<void> {
  const input = screen.getByTestId('mock-make-input') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { value: make } });
  });
}

async function typeModel(model: string): Promise<void> {
  const input = screen.getByLabelText(/^Model/i) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { value: model } });
  });
}

async function typeYear(year: string): Promise<void> {
  const input = screen.getByLabelText(/^Year/i) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { value: year } });
  });
}

async function clickCategory(label: RegExp): Promise<void> {
  const btn = screen.getByRole('button', { name: label });
  await act(async () => {
    fireEvent.click(btn);
  });
}

async function advanceDebounce(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(450);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * The button's selected-state visual indicator is the
 * `border-accent-brand` className applied conditionally at
 * `step-vehicle.tsx`. Checking the className is the cleanest way to
 * assert "this button looks pre-selected" without an aria-pressed
 * attribute. Anti-regression-safe: if the styling token changes,
 * adjust here in one place.
 */
function isButtonSelected(button: HTMLElement): boolean {
  return button.className.includes('border-accent-brand') &&
    button.className.includes('bg-accent-brand/5');
}

// ═══════════════════════════════════════════════════════════════
// Refined rule — mundane classifier results do NOT auto-select
// ═══════════════════════════════════════════════════════════════

describe('Refined rule — mundane classifier results do NOT auto-select size buttons', () => {
  it('Honda Civic → classifier returns sedan, but NO size button is highlighted', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({
      classification: classification({ size_class: 'sedan' }),
    }));

    await renderStep();
    await typeMake('Honda');
    await advanceDebounce();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    const sedanBtn = screen.getByRole('button', { name: /^Sedan$/ });
    const truckBtn = screen.getByRole('button', { name: /Truck\/SUV/ });
    const suvBtn = screen.getByRole('button', { name: /SUV \(3-Row\)/ });

    expect(isButtonSelected(sedanBtn)).toBe(false);
    expect(isButtonSelected(truckBtn)).toBe(false);
    expect(isButtonSelected(suvBtn)).toBe(false);
  });

  it('Chevy Suburban → classifier returns suv_3row_van, but NO size button is highlighted', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({
      classification: classification({ size_class: 'suv_3row_van' }),
    }));

    await renderStep();
    await typeMake('Chevrolet');
    await advanceDebounce();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    const suvBtn = screen.getByRole('button', { name: /SUV \(3-Row\)/ });
    expect(isButtonSelected(suvBtn)).toBe(false);
  });

  it("Customer's manual pick survives a mundane classifier return (not wiped)", async () => {
    // Anti-regression for the OLD useEffect that unconditionally
    // wiped manualSizeClass on every classification change.
    fetchSpy.mockResolvedValue(jsonResponse({
      classification: classification({ size_class: 'sedan' }),
    }));

    await renderStep();
    const truckBtn = screen.getByRole('button', { name: /Truck\/SUV/ });
    await act(async () => {
      fireEvent.click(truckBtn);
    });
    expect(isButtonSelected(truckBtn)).toBe(true);

    await typeMake('Honda');
    await advanceDebounce();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    expect(isButtonSelected(truckBtn)).toBe(true);
    const sedanBtn = screen.getByRole('button', { name: /^Sedan$/ });
    expect(isButtonSelected(sedanBtn)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Refined rule — classifier exotic/classic DOES write to size_class
// (flow-routing to SpecialtyVehicleBlock preserved)
// ═══════════════════════════════════════════════════════════════

describe('Refined rule — classifier exotic/classic DOES pre-select (flow-routing preserved)', () => {
  it('Ferrari → classifier returns exotic, Exotic button is highlighted', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({
      classification: classification({ size_class: 'exotic' }),
    }));

    await renderStep();
    await typeMake('Ferrari');
    await advanceDebounce();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    const exoticBtn = screen.getByRole('button', { name: /^Exotic$/ });
    expect(isButtonSelected(exoticBtn)).toBe(true);
  });

  it('Ford Mustang 1965 → classifier returns classic, Classic button is highlighted', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({
      classification: classification({ size_class: 'classic' }),
    }));

    await renderStep();
    await typeMake('Ford');
    await typeModel('Mustang');
    await typeYear('1965');
    await advanceDebounce();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    const classicBtn = screen.getByRole('button', { name: /^Classic$/ });
    expect(isButtonSelected(classicBtn)).toBe(true);
  });

  it("Customer's manual sedan pick IS wiped when classifier upgrades to exotic", async () => {
    // Flow-routing correctness — when classifier confidently detects
    // exotic/classic, the manual pick must NOT keep the customer on
    // the mundane flow. The wiping useEffect fires specifically for
    // this case (the refined rule).
    fetchSpy.mockResolvedValue(jsonResponse({
      classification: classification({ size_class: 'exotic' }),
    }));

    await renderStep();
    const sedanBtn = screen.getByRole('button', { name: /^Sedan$/ });
    await act(async () => {
      fireEvent.click(sedanBtn);
    });
    expect(isButtonSelected(sedanBtn)).toBe(true);

    await typeMake('Ferrari');
    await advanceDebounce();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    expect(isButtonSelected(sedanBtn)).toBe(false);
    const exoticBtn = screen.getByRole('button', { name: /^Exotic$/ });
    expect(isButtonSelected(exoticBtn)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Refined rule — non-automobile specialty_tier is purely manual
// ═══════════════════════════════════════════════════════════════

describe('Refined rule — non-automobile specialty_tier is purely customer-picked', () => {
  it('Motorcycle + classifier returns specialty_tier=standard_cruiser → button NOT highlighted', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({
      classification: classification({
        vehicle_category: 'motorcycle',
        vehicle_type: 'motorcycle',
        size_class: null,
        specialty_tier: 'standard_cruiser',
      }),
    }));

    await renderStep();
    await clickCategory(/^Motorcycle$/);
    await typeMake('Harley-Davidson');
    await advanceDebounce();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    const tierBtn = screen.getByRole('button', { name: /Standard \/ Cruiser/ });
    expect(isButtonSelected(tierBtn)).toBe(false);
  });

  it('RV + classifier returns specialty_tier=rv_up_to_24 → button NOT highlighted', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({
      classification: classification({
        vehicle_category: 'rv',
        vehicle_type: 'rv',
        size_class: null,
        specialty_tier: 'rv_up_to_24',
      }),
    }));

    await renderStep();
    await clickCategory(/^RV$/);
    await typeMake('Airstream');
    await advanceDebounce();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    const tierBtn = screen.getByRole('button', { name: /Up to 24/ });
    expect(isButtonSelected(tierBtn)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Finding 2 — year propagation through the wrapper
// ═══════════════════════════════════════════════════════════════

describe('Finding 2 — year is forwarded to /api/classify-vehicle', () => {
  it('Ford Mustang 1965 → fetch URL includes year=1965', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({
      classification: classification({ size_class: 'classic' }),
    }));

    await renderStep();
    await typeMake('Ford');
    await typeModel('Mustang');
    await typeYear('1965');
    await advanceDebounce();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    const lastCall = fetchSpy.mock.calls.at(-1);
    expect(lastCall).toBeTruthy();
    const url = String(lastCall![0]);
    expect(url).toMatch(/year=1965/);
    expect(url).toMatch(/make=Ford/);
    expect(url).toMatch(/model=Mustang/);
  });

  it('No year typed → fetch URL OMITS the year query param', async () => {
    // Anti-regression: previously `yr ?? undefined` was the
    // conversion at the call site. If a future refactor sends
    // `year=null` or `year=NaN` literally, this test catches it.
    fetchSpy.mockResolvedValue(jsonResponse({
      classification: classification({ size_class: 'sedan' }),
    }));

    await renderStep();
    await typeMake('Honda');
    await advanceDebounce();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    const lastCall = fetchSpy.mock.calls.at(-1);
    const url = String(lastCall![0]);
    expect(url).not.toMatch(/year=/);
  });
});
