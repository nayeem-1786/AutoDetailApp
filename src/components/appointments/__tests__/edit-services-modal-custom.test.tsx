/**
 * Item 15f Layer 3e — `<EditServicesModal>` (Admin Appointment edit)
 * custom-pricing routing.
 *
 * Pre-fix: tapping Flood Damage / Mold Extraction in the Admin "Edit
 * Services" picker silently added the row at $0 (resolveServicePrice
 * returned $0 for custom services with no flat_price + no tiers). Worst-
 * case bug pattern — no operator-visible signal that the price is wrong,
 * so the customer was never charged the staff-assessed amount.
 *
 * Patch routes `pricing_model === 'custom'` taps through
 * `<CustomPriceDialog>` so the operator enters the price up-front.
 *
 * The modal itself is scheduled for deletion in Item 15f Phase 1
 * Layer 8e (edit-via-POS restructure); this test pins the behavior
 * during the deletion-window.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EditServicesModal } from '../edit-services-modal';

afterEach(cleanup);

const FLOOD_SERVICE = {
  id: 'svc-flood',
  name: 'Flood Damage / Mold Extraction',
  description: 'Specialty water-damage restoration.',
  flat_price: null,
  custom_starting_price: 475,
  pricing_model: 'custom',
  pricing: [],
};

const REGULAR_SERVICE = {
  id: 'svc-exterior',
  name: 'Express Exterior',
  description: 'Quick wash.',
  flat_price: 50,
  custom_starting_price: null,
  pricing_model: 'flat',
  pricing: [],
};

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: [FLOOD_SERVICE, REGULAR_SERVICE] }),
  }) as unknown as typeof fetch;
});

describe('<EditServicesModal> — custom pricing_model routing (Item 15f Layer 3e)', () => {
  it('tapping a custom service opens <CustomPriceDialog> instead of silent $0 add', async () => {
    render(
      <EditServicesModal
        open
        appointmentId="appt-1"
        vehicleSizeClass={'sedan'}
        initialServices={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    // Wait for the fetched services to render.
    await waitFor(() => {
      expect(screen.getByText('Flood Damage / Mold Extraction')).toBeDefined();
    });

    // Tap the custom service.
    const tile = screen.getByText('Flood Damage / Mold Extraction').closest('button');
    fireEvent.click(tile!);

    // <CustomPriceDialog>'s "Final price ($)" input appears.
    expect(screen.getByLabelText(/Final price/)).toBeDefined();
    expect(screen.getByText(/Starting from \$475\.00/)).toBeDefined();

    // The bottom selected-count remains "0 services" — the row is NOT
    // committed until the dialog confirms.
    expect(screen.getByText('0 services')).toBeDefined();
  });

  it('confirming a custom price commits the row at the operator-entered amount', async () => {
    render(
      <EditServicesModal
        open
        appointmentId="appt-1"
        vehicleSizeClass={'sedan'}
        initialServices={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Flood Damage / Mold Extraction')).toBeDefined();
    });

    const tile = screen.getByText('Flood Damage / Mold Extraction').closest('button');
    fireEvent.click(tile!);

    // Enter $500 and confirm.
    const input = screen.getByLabelText(/Final price/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '500' } });
    const addBtn = screen.getByText(/Add Service/).closest('button');
    fireEvent.click(addBtn!);

    // The selected count reflects the commit; total displays $500.00.
    await waitFor(() => {
      expect(screen.getByText('1 service')).toBeDefined();
    });
    expect(screen.getByText('$500.00')).toBeDefined();
  });

  it('cancelling the custom dialog does NOT commit the row', async () => {
    render(
      <EditServicesModal
        open
        appointmentId="appt-1"
        vehicleSizeClass={'sedan'}
        initialServices={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Flood Damage / Mold Extraction')).toBeDefined();
    });

    const tile = screen.getByText('Flood Damage / Mold Extraction').closest('button');
    fireEvent.click(tile!);

    // Cancel the dialog.
    const cancelBtns = screen.getAllByText('Cancel');
    // The first Cancel is the modal's footer; the second is <CustomPriceDialog>'s.
    // Find the one inside the price dialog by looking for the closest button
    // sibling to the Add Service button.
    const dialogCancelBtn = cancelBtns
      .map((el) => el.closest('button'))
      .find((btn) => btn?.parentElement?.querySelector('button:nth-of-type(2)')?.textContent?.includes('Add Service'));
    fireEvent.click(dialogCancelBtn!);

    // Selected count stays at 0 — no row committed.
    expect(screen.getByText('0 services')).toBeDefined();
  });

  it('regular (non-custom) service still uses silent toggle (no dialog)', async () => {
    render(
      <EditServicesModal
        open
        appointmentId="appt-1"
        vehicleSizeClass={'sedan'}
        initialServices={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Express Exterior')).toBeDefined();
    });

    const tile = screen.getByText('Express Exterior').closest('button');
    fireEvent.click(tile!);

    // No <CustomPriceDialog> opened — "Final price ($)" should be absent.
    expect(screen.queryByLabelText(/Final price/)).toBeNull();

    // Row committed at flat_price ($50.00).
    expect(screen.getByText('1 service')).toBeDefined();
  });
});
