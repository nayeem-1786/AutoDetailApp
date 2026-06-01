/**
 * #136 T8 — Vehicle-form reset contract (cross-surface).
 *
 * The durable regression lock for VEHICLE_FORMS_BEHAVIOR_AUDIT.md (#135).
 * Mirrors the Track B structural-guard pattern (#120) — one test file
 * runs the SAME behavioral assertions against BOTH `StepVehicle` (public
 * booking) and `VehicleFormDialog` (customer portal). Future refactors
 * that partially fix one form's reset semantics but break the other's
 * will fail this contract immediately.
 *
 * Operator-locked T1 anchor (per #135 audit): on category change, ALL
 * non-category fields reset (year, color, make, model, vin,
 * license_plate, notes, classifier state). Year + color persistence
 * was the operator-reported B1 defect this contract prevents from
 * recurring.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { StepVehicle } from '../booking/step-vehicle';
import { VehicleFormDialog } from '../account/vehicle-form-dialog';

afterEach(cleanup);

// --- Shared mocks ----------------------------------------------------------
// VehicleMakeCombobox fetches /api/vehicle-makes; neutralize that.
// createClient is used by the classifier; neutralize the supabase chain.
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ makes: [] }),
  }) as unknown as typeof fetch;
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        ilike: () => ({
          eq: () => Promise.resolve({ data: [] }),
        }),
      }),
    }),
  }),
}));

// Toast is fire-and-forget on submit; stub it.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// ───────────────────────────────────────────────────────────────────────
// StepVehicle (public booking Step 1)
// ───────────────────────────────────────────────────────────────────────

describe('#136 T8 — StepVehicle reset contract', () => {
  const fullVehicle = {
    vehicle_category: 'automobile',
    vehicle_type: 'standard',
    size_class: 'sedan',
    specialty_tier: null,
    make: 'Honda',
    model: 'Civic',
    year: 2020,
    color: 'Red',
  };

  function renderStepVehicle() {
    return render(
      <StepVehicle
        customerData={null}
        onContinue={vi.fn()}
        initialVehicle={fullVehicle}
      />
    );
  }

  it('initially renders all non-category fields populated from initialVehicle', () => {
    renderStepVehicle();
    expect((screen.getByLabelText(/^Year/i) as HTMLInputElement).value).toBe('2020');
    expect((screen.getByLabelText(/^Color/i) as HTMLInputElement).value).toBe('Red');
    expect((screen.getByLabelText(/^Model/i) as HTMLInputElement).value).toBe('Civic');
  });

  it('category change resets year, color, make, model (B1 anchor)', async () => {
    renderStepVehicle();

    // Sanity — initial values present
    expect((screen.getByLabelText(/^Year/i) as HTMLInputElement).value).toBe('2020');
    expect((screen.getByLabelText(/^Color/i) as HTMLInputElement).value).toBe('Red');

    // Trigger category change to RV.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^RV$/i }));
    });

    // T1 anchor: every non-category field is reset.
    expect((screen.getByLabelText(/^Year/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^Color/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^Model/i) as HTMLInputElement).value).toBe('');
    // Make combobox renders its input; whether queried by label or by
    // placeholder, the value must be empty.
    const makeInput = screen.getByPlaceholderText(/Search makes\.\.\./i) as HTMLInputElement;
    expect(makeInput.value).toBe('');
  });

  it('resets across ALL 4 non-automobile target categories (operator-universality)', async () => {
    for (const buttonName of [/^Motorcycle$/i, /^RV$/i, /^Boat$/i, /^Aircraft$/i]) {
      cleanup();
      renderStepVehicle();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: buttonName }));
      });
      expect((screen.getByLabelText(/^Year/i) as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText(/^Color/i) as HTMLInputElement).value).toBe('');
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// VehicleFormDialog (customer portal)
// ───────────────────────────────────────────────────────────────────────

describe('#136 T8 — VehicleFormDialog reset contract', () => {
  const fullVehicle = {
    id: 'veh-1',
    vehicle_type: 'standard',
    vehicle_category: 'automobile',
    size_class: 'sedan',
    specialty_tier: null,
    year: 2020,
    make: 'Honda',
    model: 'Civic',
    color: 'Red',
    vin: '1HGBH41JXMN109186',
    license_plate: '8ABC123',
    notes: 'Ceramic coating applied 2023',
  };

  function renderDialog() {
    return render(
      <VehicleFormDialog
        open={true}
        onOpenChange={vi.fn()}
        vehicle={fullVehicle}
        onSuccess={vi.fn()}
      />
    );
  }

  it('initially renders ALL fields populated, including vin/license_plate/notes', () => {
    renderDialog();
    expect((screen.getByLabelText(/^Year/i) as HTMLInputElement).value).toBe('2020');
    expect((screen.getByLabelText(/^Color/i) as HTMLInputElement).value).toBe('Red');
    expect((screen.getByLabelText(/^Model/i) as HTMLInputElement).value).toBe('Civic');
    expect((screen.getByLabelText(/VIN/i) as HTMLInputElement).value).toBe('1HGBH41JXMN109186');
    expect((screen.getByLabelText(/License plate/i) as HTMLInputElement).value).toBe('8ABC123');
    expect((screen.getByLabelText(/^Notes/i) as HTMLInputElement).value).toBe(
      'Ceramic coating applied 2023'
    );
  });

  it('category change resets year, color, model, vin, license_plate, notes (B1 anchor)', async () => {
    renderDialog();

    // Sanity
    expect((screen.getByLabelText(/^Year/i) as HTMLInputElement).value).toBe('2020');
    expect((screen.getByLabelText(/VIN/i) as HTMLInputElement).value).toBe('1HGBH41JXMN109186');

    // Switch category to RV via the Select.
    const categorySelect = screen.getByLabelText(/^Category/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(categorySelect, { target: { value: 'rv' } });
    });

    // T1 anchor — every non-category field reset.
    expect((screen.getByLabelText(/^Year/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^Color/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^Model/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/VIN/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/License plate/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^Notes/i) as HTMLInputElement).value).toBe('');
  });

  it('Category Select itself reflects the new category', async () => {
    renderDialog();
    const categorySelect = screen.getByLabelText(/^Category/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(categorySelect, { target: { value: 'motorcycle' } });
    });
    expect(categorySelect.value).toBe('motorcycle');
  });
});
