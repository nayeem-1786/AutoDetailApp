import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * V1+V2 (Session #130) — check-prerequisites must surface
 * `is_compatible_with_vehicle` per prereq + `ticket_vehicle_category` so
 * the client can block the cross-category auto-add path with a clear
 * category-specific message (Option A — transparency over filtering).
 *
 * These tests pin:
 *   1. Compat flag is true when prereq's vehicle_compatibility includes the
 *      ticket vehicle's category (mapped via categoryToCompatibilityKey).
 *   2. Compat flag is false when explicitly excluded.
 *   3. Compat flag is true when prereq has no compatibility restriction
 *      (empty list = universally compatible).
 *   4. Compat flag is true when no vehicle is attached (no axis to evaluate).
 *   5. The "automobile ↔ standard" vocabulary bridge is applied — a
 *      vehicle_category of 'automobile' matches a compat list of ['standard'].
 *   6. All 5 vehicle_category values round-trip through the gate.
 *   7. ticket_vehicle_category is returned at top-level for the dialog to
 *      build the error message without a second lookup.
 *   8. compatible_categories returns the prereq's allowed categories already
 *      translated back to the VehicleCategory vocabulary (standard→automobile).
 */

interface PrereqRow {
  id: string;
  prerequisite_service_id: string;
  enforcement: 'required_same_ticket' | 'required_history' | 'recommended';
  history_window_days: number | null;
  warning_message: string | null;
  prerequisite_service: { id: string; name: string; vehicle_compatibility: string[] | null };
}

const state = {
  authenticated: true as boolean,
  prereqs: [] as PrereqRow[],
  vehicleRow: null as { vehicle_category: string } | null,
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => (state.authenticated ? { id: 'emp-1', name: 'Tester' } : null),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'service_prerequisites') {
        return {
          select: (_cols: string) => ({
            eq: async (_col: string, _val: string) => ({ data: state.prereqs, error: null }),
          }),
        };
      }
      if (table === 'vehicles') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: async () => ({ data: state.vehicleRow, error: null }),
            }),
          }),
        };
      }
      // transaction_items: not exercised in these tests (no history_window_days)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gte: () => ({
                    order: () => ({ limit: async () => ({ data: [], error: null }) }),
                  }),
                }),
              }),
            }),
            eq2: () => ({}),
          }),
        }),
      };
    },
  }),
}));

import { POST } from '../route';

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/pos/services/check-prerequisites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePrereq(overrides: Partial<PrereqRow> = {}): PrereqRow {
  return {
    id: 'sp-1',
    prerequisite_service_id: 'prereq-svc-1',
    enforcement: 'required_same_ticket',
    history_window_days: null,
    warning_message: null,
    prerequisite_service: {
      id: 'prereq-svc-1',
      name: 'Express Exterior Wash',
      vehicle_compatibility: ['standard'],
    },
    ...overrides,
  };
}

beforeEach(() => {
  state.authenticated = true;
  state.prereqs = [];
  state.vehicleRow = null;
});

describe('check-prerequisites — vehicle compatibility (V2, Session #130)', () => {
  it('flags an automobile-only prereq as compatible against an automobile ticket', async () => {
    state.prereqs = [makePrereq({
      prerequisite_service: {
        id: 'p1',
        name: 'Express Exterior Wash',
        vehicle_compatibility: ['standard'], // 'standard' = automobile
      },
    })];
    state.vehicleRow = { vehicle_category: 'automobile' };

    const res = await POST(req({ service_id: 'svc-X', vehicle_id: 'veh-1' }));
    const json = await res.json();
    expect(json.has_prerequisites).toBe(true);
    expect(json.ticket_vehicle_category).toBe('automobile');
    expect(json.prerequisites[0].is_compatible_with_vehicle).toBe(true);
    expect(json.prerequisites[0].compatible_categories).toEqual(['automobile']);
  });

  it('flags an RV-only prereq as INCOMPATIBLE against an automobile ticket (V1 headline)', async () => {
    state.prereqs = [makePrereq({
      prerequisite_service: {
        id: 'p2',
        name: 'RV Interior Clean',
        vehicle_compatibility: ['rv'],
      },
    })];
    state.vehicleRow = { vehicle_category: 'automobile' };

    const res = await POST(req({ service_id: 'svc-X', vehicle_id: 'veh-1' }));
    const json = await res.json();
    expect(json.ticket_vehicle_category).toBe('automobile');
    expect(json.prerequisites[0].is_compatible_with_vehicle).toBe(false);
    expect(json.prerequisites[0].compatible_categories).toEqual(['rv']);
  });

  it('flags a prereq with no compatibility restriction as universally compatible', async () => {
    state.prereqs = [makePrereq({
      prerequisite_service: { id: 'p3', name: 'Universal Prereq', vehicle_compatibility: [] },
    })];
    state.vehicleRow = { vehicle_category: 'aircraft' };

    const res = await POST(req({ service_id: 'svc-X', vehicle_id: 'veh-1' }));
    const json = await res.json();
    expect(json.prerequisites[0].is_compatible_with_vehicle).toBe(true);
    expect(json.prerequisites[0].compatible_categories).toEqual([]);
  });

  it('treats a missing vehicle_compatibility (null) as universally compatible', async () => {
    state.prereqs = [makePrereq({
      prerequisite_service: { id: 'p4', name: 'Legacy Prereq', vehicle_compatibility: null },
    })];
    state.vehicleRow = { vehicle_category: 'boat' };

    const res = await POST(req({ service_id: 'svc-X', vehicle_id: 'veh-1' }));
    const json = await res.json();
    expect(json.prerequisites[0].is_compatible_with_vehicle).toBe(true);
  });

  it('treats no-vehicle-attached as compatible (no axis to evaluate) and returns null category', async () => {
    state.prereqs = [makePrereq({
      prerequisite_service: { id: 'p5', name: 'RV-only', vehicle_compatibility: ['rv'] },
    })];
    state.vehicleRow = null;

    const res = await POST(req({ service_id: 'svc-X' /* no vehicle_id */ }));
    const json = await res.json();
    expect(json.ticket_vehicle_category).toBeNull();
    expect(json.prerequisites[0].is_compatible_with_vehicle).toBe(true);
  });

  it('round-trips all 5 vehicle categories — each is flagged true only when included in compat list', async () => {
    const allCats = ['automobile', 'motorcycle', 'rv', 'boat', 'aircraft'] as const;
    for (const ticketCat of allCats) {
      // Prereq accepts only this exact category (in compat-key vocab — automobile→standard)
      const compatKey = ticketCat === 'automobile' ? 'standard' : ticketCat;
      state.prereqs = [makePrereq({
        prerequisite_service: { id: 'p', name: `${ticketCat}-only`, vehicle_compatibility: [compatKey] },
      })];
      state.vehicleRow = { vehicle_category: ticketCat };

      const res = await POST(req({ service_id: 'svc-X', vehicle_id: 'veh-1' }));
      const json = await res.json();
      expect(json.ticket_vehicle_category).toBe(ticketCat);
      expect(json.prerequisites[0].is_compatible_with_vehicle).toBe(true);
      expect(json.prerequisites[0].compatible_categories).toEqual([ticketCat]);

      // And the same prereq against a DIFFERENT category is incompatible
      const otherCat = ticketCat === 'automobile' ? 'rv' : 'automobile';
      state.vehicleRow = { vehicle_category: otherCat };
      const res2 = await POST(req({ service_id: 'svc-X', vehicle_id: 'veh-1' }));
      const json2 = await res2.json();
      expect(json2.prerequisites[0].is_compatible_with_vehicle).toBe(false);
    }
  });

  it('returns ticket_vehicle_category at top-level even when there are no prerequisites', async () => {
    state.prereqs = [];
    state.vehicleRow = { vehicle_category: 'motorcycle' };

    const res = await POST(req({ service_id: 'svc-X', vehicle_id: 'veh-1' }));
    const json = await res.json();
    expect(json.has_prerequisites).toBe(false);
    expect(json.satisfied).toBe(true);
    expect(json.prerequisites).toEqual([]);
    expect(json.ticket_vehicle_category).toBe('motorcycle');
  });

  it('does NOT filter incompatible prereqs from the response (Option A — transparency over filtering)', async () => {
    state.prereqs = [
      makePrereq({
        id: 'sp-a',
        prerequisite_service_id: 'pa',
        prerequisite_service: { id: 'pa', name: 'Compatible Wash', vehicle_compatibility: ['standard'] },
      }),
      makePrereq({
        id: 'sp-b',
        prerequisite_service_id: 'pb',
        prerequisite_service: { id: 'pb', name: 'RV-only Clean', vehicle_compatibility: ['rv'] },
      }),
    ];
    state.vehicleRow = { vehicle_category: 'automobile' };

    const res = await POST(req({ service_id: 'svc-X', vehicle_id: 'veh-1' }));
    const json = await res.json();
    // Both come back — the incompatible one is FLAGGED, not removed.
    expect(json.prerequisites).toHaveLength(2);
    expect(json.prerequisites.find((p: { service_name: string }) => p.service_name === 'Compatible Wash')!.is_compatible_with_vehicle).toBe(true);
    expect(json.prerequisites.find((p: { service_name: string }) => p.service_name === 'RV-only Clean')!.is_compatible_with_vehicle).toBe(false);
  });
});
