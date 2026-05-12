// Phase Mobile-1.9 — full mobile picker edit modal. Shared by POS jobs
// detail and admin appointment dialog (mode prop swaps the underlying
// auth surface). Tests cover: render with pre-filled snapshot, zone
// fetch on open, toggle visibility, custom-path inputs, X clear,
// validation messages, save body shape, and mismatch_amount handoff.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import {
  EditMobileModal,
  type EditMobileModalSavedResult,
} from '../edit-mobile-modal';

// Mock posFetch and global fetch — the modal selects between them via mode.
const posFetchMock = vi.fn();
vi.mock('@/app/pos/lib/pos-fetch', () => ({
  posFetch: (...args: unknown[]) => posFetchMock(...args),
}));

// sonner toast: silence for tests.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const zones = [
  { id: 'z1', name: 'Mobile Service (0-3 miles)', surcharge: 40, is_available: true },
  { id: 'z2', name: 'Mobile Service (3-10 miles)', surcharge: 80, is_available: true },
  { id: 'z3', name: 'Unavailable Zone', surcharge: 999, is_available: false },
];

beforeEach(() => {
  posFetchMock.mockReset();
  posFetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/mobile-zones')) {
      return {
        ok: true,
        json: async () => ({ zones }),
      } as Response;
    }
    return { ok: true, json: async () => ({ data: {}, mismatch_amount: 0 }) } as Response;
  });
});

afterEach(() => {
  cleanup();
});

function defaultInitial(overrides: Partial<{
  is_mobile: boolean;
  mobile_zone_id: string | null;
  mobile_surcharge: number;
  mobile_address: string | null;
  mobile_zone_name_snapshot: string | null;
}> = {}) {
  return {
    is_mobile: false,
    mobile_zone_id: null,
    mobile_surcharge: 0,
    mobile_address: null,
    mobile_zone_name_snapshot: null,
    ...overrides,
  };
}

describe('EditMobileModal — render + state', () => {
  it('open=false: renders nothing', () => {
    render(
      <EditMobileModal
        open={false}
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial()}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    expect(screen.queryByText(/Edit Mobile Service/i)).toBeNull();
  });

  it('open=true with is_mobile=false: shows toggle off, hides zone/address fields', async () => {
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({ is_mobile: false })}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    await waitFor(() =>
      expect(posFetchMock).toHaveBeenCalledWith('/api/pos/mobile-zones')
    );
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(document.getElementById('edit-mobile-address')).toBeNull();
  });

  it('open=true with is_mobile=true: pre-fills address + zone from snapshot, fetches zones', async () => {
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({
          is_mobile: true,
          mobile_zone_id: 'z1',
          mobile_surcharge: 40,
          mobile_address: '123 Main St, Torrance, CA 90501',
          mobile_zone_name_snapshot: 'Mobile Service (0-3 miles)',
        })}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    await waitFor(() =>
      expect(posFetchMock).toHaveBeenCalledWith('/api/pos/mobile-zones')
    );
    const addr = document.getElementById('edit-mobile-address') as HTMLInputElement;
    expect(addr.value).toBe('123 Main St, Torrance, CA 90501');
    const zoneSelect = document.getElementById('edit-mobile-zone') as HTMLSelectElement;
    await waitFor(() => expect(zoneSelect.value).toBe('z1'));
  });

  it('zone dropdown filters out is_available=false zones', async () => {
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({ is_mobile: true, mobile_address: '123 X' })}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/Mobile Service \(0-3 miles\)/)).toBeTruthy();
    });
    expect(screen.queryByText(/Unavailable Zone/)).toBeNull();
  });
});

describe('EditMobileModal — validation', () => {
  it('save with mobile on + empty address: shows address-required error, no PATCH', async () => {
    const onSaved = vi.fn();
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({ is_mobile: true, mobile_zone_id: 'z1', mobile_surcharge: 40 })}
        onClose={() => {}}
        onSaved={onSaved}
      />
    );
    await waitFor(() => expect(posFetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() =>
      expect(screen.getByText(/Address is required/)).toBeTruthy()
    );
    expect(posFetchMock).toHaveBeenCalledTimes(1); // only zones fetch, no PATCH
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('save with mobile on + no zone selected: shows zone-required error', async () => {
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({
          is_mobile: true,
          mobile_address: '123 Main St',
        })}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    await waitFor(() => expect(posFetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() =>
      expect(screen.getByText(/select a service area/i)).toBeTruthy()
    );
  });

  it('custom path with surcharge=0: shows custom-fee error', async () => {
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({
          is_mobile: true,
          mobile_address: '123 Main St',
        })}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    await waitFor(() => expect(posFetchMock).toHaveBeenCalledTimes(1));
    const zoneSelect = document.getElementById('edit-mobile-zone') as HTMLSelectElement;
    fireEvent.change(zoneSelect, { target: { value: '__custom__' } });
    // Now Custom inputs should render.
    expect(document.getElementById('edit-mobile-custom-surcharge')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() =>
      expect(screen.getByText(/between \$1 and \$500/)).toBeTruthy()
    );
  });
});

describe('EditMobileModal — save body shape', () => {
  it('zone-path save: POSTs is_mobile=true, mobile_zone_id, surcharge, address; is_custom=false', async () => {
    posFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/mobile-zones')) {
        return { ok: true, json: async () => ({ zones }) } as Response;
      }
      // Capture body for assertion later via mock.calls.
      return {
        ok: true,
        json: async () => ({
          data: {
            is_mobile: true,
            mobile_zone_id: 'z1',
            mobile_surcharge: 40,
            mobile_address: '123 Main St',
            mobile_zone_name_snapshot: 'Mobile Service (0-3 miles)',
            subtotal: 115,
            total_amount: 115,
          },
          mismatch_amount: 0,
        }),
      } as Response;
    });
    const onSaved = vi.fn();
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({
          is_mobile: true,
          mobile_zone_id: 'z1',
          mobile_surcharge: 40,
          mobile_address: '123 Main St',
          mobile_zone_name_snapshot: 'Mobile Service (0-3 miles)',
        })}
        onClose={() => {}}
        onSaved={onSaved}
      />
    );
    await waitFor(() => expect(posFetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    const patchCall = posFetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/mobile-service')
    );
    expect(patchCall).toBeTruthy();
    expect(patchCall![0]).toBe('/api/pos/appointments/appt-1/mobile-service');
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body.is_mobile).toBe(true);
    expect(body.mobile_zone_id).toBe('z1');
    expect(body.mobile_surcharge).toBe(40);
    expect(body.mobile_address).toBe('123 Main St');
    expect(body.is_custom).toBe(false);
  });

  it('toggle-off save: POSTs is_mobile=false, mobile_zone_id=null, surcharge=0', async () => {
    posFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/mobile-zones')) {
        return { ok: true, json: async () => ({ zones }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            is_mobile: false,
            mobile_zone_id: null,
            mobile_surcharge: 0,
            mobile_address: null,
            mobile_zone_name_snapshot: null,
            subtotal: 75,
            total_amount: 75,
          },
          mismatch_amount: 0,
        }),
      } as Response;
    });
    const onSaved = vi.fn();
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({
          is_mobile: true,
          mobile_zone_id: 'z1',
          mobile_surcharge: 40,
          mobile_address: '123 Main St',
          mobile_zone_name_snapshot: 'Zone',
        })}
        onClose={() => {}}
        onSaved={onSaved}
      />
    );
    await waitFor(() => expect(posFetchMock).toHaveBeenCalledTimes(1));
    // Toggle mobile off.
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    const patchCall = posFetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/mobile-service')
    );
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body.is_mobile).toBe(false);
    expect(body.mobile_zone_id).toBeNull();
    expect(body.mobile_surcharge).toBe(0);
  });

  it('onSaved receives mismatch_amount from response', async () => {
    posFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/mobile-zones')) {
        return { ok: true, json: async () => ({ zones }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            is_mobile: true,
            mobile_zone_id: 'z2',
            mobile_surcharge: 80,
            mobile_address: '456 Far Ave',
            mobile_zone_name_snapshot: 'Mobile Service (3-10 miles)',
            subtotal: 225,
            total_amount: 225,
          },
          mismatch_amount: 40,
        }),
      } as Response;
    });
    const onSaved = vi.fn();
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({
          is_mobile: true,
          mobile_zone_id: 'z1',
          mobile_surcharge: 40,
          mobile_address: '456 Far Ave',
          mobile_zone_name_snapshot: 'Mobile Service (0-3 miles)',
        })}
        onClose={() => {}}
        onSaved={onSaved}
      />
    );
    await waitFor(() => expect(posFetchMock).toHaveBeenCalledTimes(1));
    const zoneSelect = document.getElementById('edit-mobile-zone') as HTMLSelectElement;
    fireEvent.change(zoneSelect, { target: { value: 'z2' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const arg = onSaved.mock.calls[0][0] as EditMobileModalSavedResult;
    expect(arg.mismatch_amount).toBe(40);
    expect(arg.total_amount).toBe(225);
  });
});

describe('EditMobileModal — Phase 1.9.1 dropdown init', () => {
  // Phase Mobile-1.9.1 — the zone-dropdown resync effect runs after live
  // zones load and derives the authoritative `(zoneId, isCustom)` pair
  // from `initial.mobile_zone_id` + `mobile_surcharge` + live zones.

  it('edit mode with mobile_zone_id matching a live zone: dropdown selects that zone, not Custom', async () => {
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({
          is_mobile: true,
          mobile_zone_id: 'z2',
          mobile_surcharge: 80,
          mobile_address: '456 Far Ave',
          mobile_zone_name_snapshot: 'Mobile Service (3-10 miles)',
        })}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    // Wait for zones fetch to complete; once it does, resync should run
    // and pick the matching zone in the dropdown.
    await waitFor(() => {
      const select = document.getElementById(
        'edit-mobile-zone'
      ) as HTMLSelectElement;
      expect(select?.value).toBe('z2');
    });
  });

  it('edit mode with mobile_zone_id null + surcharge>0 (Custom path record): dropdown selects Custom, custom inputs pre-filled', async () => {
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({
          is_mobile: true,
          mobile_zone_id: null,
          mobile_surcharge: 65,
          mobile_address: '789 PV Estates Dr',
          mobile_zone_name_snapshot: 'PV Estates',
        })}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    await waitFor(() => {
      const select = document.getElementById(
        'edit-mobile-zone'
      ) as HTMLSelectElement;
      expect(select?.value).toBe('__custom__');
    });
    // Custom inputs pre-filled from snapshot.
    const surchargeInput = document.getElementById(
      'edit-mobile-custom-surcharge'
    ) as HTMLInputElement;
    const labelInput = document.getElementById(
      'edit-mobile-custom-label'
    ) as HTMLInputElement;
    expect(Number(surchargeInput.value)).toBe(65);
    expect(labelInput.value).toBe('PV Estates');
  });

  it('edit mode with mobile_zone_id pointing to non-existent zone (deleted-zone recovery): dropdown defaults to Custom with snapshot pre-fill', async () => {
    // Live zones list does NOT contain the appointment's zone id —
    // simulates a zone that was deleted in Settings after this job was
    // created. The resync effect should switch to Custom path and
    // preserve the historical label + surcharge so admin can correct
    // without losing context.
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({
          is_mobile: true,
          mobile_zone_id: 'z-deleted-id',
          mobile_surcharge: 50,
          mobile_address: '321 Removed Zone Rd',
          mobile_zone_name_snapshot: 'Removed Mobile Zone',
        })}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    await waitFor(() => {
      const select = document.getElementById(
        'edit-mobile-zone'
      ) as HTMLSelectElement;
      expect(select?.value).toBe('__custom__');
    });
    const surchargeInput = document.getElementById(
      'edit-mobile-custom-surcharge'
    ) as HTMLInputElement;
    const labelInput = document.getElementById(
      'edit-mobile-custom-label'
    ) as HTMLInputElement;
    expect(Number(surchargeInput.value)).toBe(50);
    expect(labelInput.value).toBe('Removed Mobile Zone');
  });

  it('enable mode (is_mobile=false initial → opened with toggle ON): dropdown stays at placeholder, no preselect', async () => {
    // Parent passes initial.is_mobile=true with blank zone/surcharge/
    // address to simulate the "+ Enable" entry point. The resync effect
    // sees `initial.mobile_zone_id=null` AND `surcharge=0` (Case 4) so
    // it leaves the dropdown at the placeholder.
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={{
          is_mobile: true,
          mobile_zone_id: null,
          mobile_surcharge: 0,
          mobile_address: null,
          mobile_zone_name_snapshot: null,
        }}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    // Wait for zones to load — give the resync effect a chance to fire
    // (it should be a no-op for this case).
    await waitFor(() =>
      expect(posFetchMock).toHaveBeenCalledWith('/api/pos/mobile-zones')
    );
    // Settle microtasks so the mock resolves.
    await new Promise((r) => setTimeout(r, 0));
    const select = document.getElementById(
      'edit-mobile-zone'
    ) as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('save body shape: zone-path save sends mobile_zone_id from the matched live zone', async () => {
    // End-to-end check that the resync's matched zone id flows through
    // to the save body. Without the resync, the save body for a valid
    // zone record sent `null` (the pre-fix bug). This test pins the
    // fixed behavior.
    posFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/mobile-zones')) {
        return { ok: true, json: async () => ({ zones }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            is_mobile: true,
            mobile_zone_id: 'z1',
            mobile_surcharge: 40,
            mobile_address: '123 Main St',
            mobile_zone_name_snapshot: 'Mobile Service (0-3 miles)',
            subtotal: 115,
            total_amount: 115,
          },
          mismatch_amount: 0,
        }),
      } as Response;
    });
    const onSaved = vi.fn();
    render(
      <EditMobileModal
        open
        mode="pos"
        appointmentId="appt-1"
        initial={defaultInitial({
          is_mobile: true,
          mobile_zone_id: 'z1',
          mobile_surcharge: 40,
          mobile_address: '123 Main St',
          mobile_zone_name_snapshot: 'Mobile Service (0-3 miles)',
        })}
        onClose={() => {}}
        onSaved={onSaved}
      />
    );
    // Wait for the resync to land the matched zone in the dropdown
    // BEFORE clicking save (otherwise the save body would reflect the
    // pre-resync provisional state).
    await waitFor(() => {
      const select = document.getElementById(
        'edit-mobile-zone'
      ) as HTMLSelectElement;
      expect(select?.value).toBe('z1');
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    const patchCall = posFetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/mobile-service')
    );
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body.mobile_zone_id).toBe('z1');
    expect(body.is_custom).toBe(false);
  });
});

describe('EditMobileModal — admin mode endpoint routing', () => {
  it('mode=admin: uses global fetch + /api/admin/* endpoints', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ zones }),
    });
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      render(
        <EditMobileModal
          open
          mode="admin"
          appointmentId="appt-1"
          initial={defaultInitial({ is_mobile: true, mobile_address: '123 Main St' })}
          onClose={() => {}}
          onSaved={() => {}}
        />
      );
      await waitFor(() =>
        expect(fetchSpy).toHaveBeenCalledWith('/api/admin/mobile-zones')
      );
      expect(posFetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
