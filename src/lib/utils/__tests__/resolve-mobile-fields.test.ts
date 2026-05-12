import { describe, it, expect, vi } from 'vitest';
import {
  MobileFieldsError,
  resolveMobileFields,
} from '@/lib/utils/resolve-mobile-fields';
import type { SupabaseClient } from '@supabase/supabase-js';

// Phase Mobile-1.9 — generic mobile-fields resolver. Same rules the
// Phase Mobile-1 quote / booking paths enforce, now exposed as a shared
// utility so the appointment mobile-service PATCH endpoint shares them.

function mockSupabaseWithZone(zone: {
  id: string;
  name: string;
  surcharge: number;
  is_available: boolean;
}): SupabaseClient {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: zone, error: null })),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

function mockSupabaseZoneNotFound(): SupabaseClient {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: null,
            error: { message: 'not found' },
          })),
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

describe('resolveMobileFields', () => {
  it('is_mobile=false: returns null/zero state, no DB query', async () => {
    const sb = mockSupabaseWithZone({
      id: 'z1',
      name: 'Zone 1',
      surcharge: 40,
      is_available: true,
    });
    const result = await resolveMobileFields(sb, { is_mobile: false });
    expect(result).toEqual({
      isMobile: false,
      zoneId: null,
      address: null,
      surcharge: 0,
      snapshotName: null,
    });
  });

  it('is_mobile=true, no address: throws "Address is required"', async () => {
    const sb = mockSupabaseWithZone({
      id: 'z1',
      name: 'Zone 1',
      surcharge: 40,
      is_available: true,
    });
    await expect(
      resolveMobileFields(sb, {
        is_mobile: true,
        mobile_zone_id: 'z1',
        mobile_surcharge: 40,
        mobile_address: '',
      })
    ).rejects.toThrow('Address is required for mobile service');
  });

  it('is_mobile=true, no zone, is_custom=false: throws "Please select"', async () => {
    const sb = mockSupabaseWithZone({
      id: 'z1',
      name: 'Zone 1',
      surcharge: 40,
      is_available: true,
    });
    await expect(
      resolveMobileFields(sb, {
        is_mobile: true,
        mobile_address: '123 Main St',
        is_custom: false,
      })
    ).rejects.toThrow('Please select a service area');
  });

  it('zone path: snapshots LIVE zone name + surcharge at save time', async () => {
    const sb = mockSupabaseWithZone({
      id: 'z1',
      name: 'Premium Mobile (Renamed)',
      surcharge: 50,
      is_available: true,
    });
    const result = await resolveMobileFields(sb, {
      is_mobile: true,
      mobile_zone_id: 'z1',
      mobile_surcharge: 50,
      mobile_address: '123 Main St',
    });
    expect(result.snapshotName).toBe('Premium Mobile (Renamed)');
    expect(result.surcharge).toBe(50);
    expect(result.zoneId).toBe('z1');
  });

  it('zone path: client surcharge mismatch → throws', async () => {
    // Security check: server re-fetches and rejects if client says
    // $40 but live zone is now $50 (Settings was edited mid-session).
    const sb = mockSupabaseWithZone({
      id: 'z1',
      name: 'Zone 1',
      surcharge: 50,
      is_available: true,
    });
    await expect(
      resolveMobileFields(sb, {
        is_mobile: true,
        mobile_zone_id: 'z1',
        mobile_surcharge: 40,
        mobile_address: '123 Main St',
      })
    ).rejects.toThrow('Mobile surcharge mismatch');
  });

  it('zone path: zone not found → throws "Invalid mobile zone"', async () => {
    const sb = mockSupabaseZoneNotFound();
    await expect(
      resolveMobileFields(sb, {
        is_mobile: true,
        mobile_zone_id: 'ghost-id',
        mobile_surcharge: 40,
        mobile_address: '123 Main St',
      })
    ).rejects.toThrow('Invalid mobile zone');
  });

  it('zone path: zone not available → throws', async () => {
    const sb = mockSupabaseWithZone({
      id: 'z1',
      name: 'Zone 1',
      surcharge: 40,
      is_available: false,
    });
    await expect(
      resolveMobileFields(sb, {
        is_mobile: true,
        mobile_zone_id: 'z1',
        mobile_surcharge: 40,
        mobile_address: '123 Main St',
      })
    ).rejects.toThrow('not available');
  });

  it('custom path: valid surcharge + label → snapshots custom label', async () => {
    const sb = mockSupabaseWithZone({
      id: 'z1',
      name: 'Zone 1',
      surcharge: 40,
      is_available: true,
    });
    const result = await resolveMobileFields(sb, {
      is_mobile: true,
      mobile_zone_id: null,
      mobile_surcharge: 65,
      mobile_address: '123 Main St',
      mobile_zone_name_snapshot: 'PV Estates',
      is_custom: true,
    });
    expect(result.zoneId).toBeNull();
    expect(result.surcharge).toBe(65);
    expect(result.snapshotName).toBe('PV Estates');
  });

  it('custom path: empty label → snapshots "Custom" fallback', async () => {
    const sb = mockSupabaseWithZone({
      id: 'z1',
      name: 'Zone 1',
      surcharge: 40,
      is_available: true,
    });
    const result = await resolveMobileFields(sb, {
      is_mobile: true,
      mobile_zone_id: null,
      mobile_surcharge: 25,
      mobile_address: '123 Main St',
      mobile_zone_name_snapshot: '',
      is_custom: true,
    });
    expect(result.snapshotName).toBe('Custom');
  });

  it('custom path: surcharge=0 → throws "between $1 and $500"', async () => {
    const sb = mockSupabaseWithZone({
      id: 'z1',
      name: 'Zone 1',
      surcharge: 40,
      is_available: true,
    });
    await expect(
      resolveMobileFields(sb, {
        is_mobile: true,
        mobile_zone_id: null,
        mobile_surcharge: 0,
        mobile_address: '123 Main St',
        is_custom: true,
      })
    ).rejects.toThrow('between $1 and $500');
  });

  it('custom path: surcharge > 500 → throws', async () => {
    const sb = mockSupabaseWithZone({
      id: 'z1',
      name: 'Zone 1',
      surcharge: 40,
      is_available: true,
    });
    await expect(
      resolveMobileFields(sb, {
        is_mobile: true,
        mobile_zone_id: null,
        mobile_surcharge: 600,
        mobile_address: '123 Main St',
        is_custom: true,
      })
    ).rejects.toThrow('between $1 and $500');
  });

  it('address truncated to 200 chars on storage', async () => {
    const sb = mockSupabaseWithZone({
      id: 'z1',
      name: 'Zone 1',
      surcharge: 40,
      is_available: true,
    });
    const long = 'x'.repeat(250);
    const result = await resolveMobileFields(sb, {
      is_mobile: true,
      mobile_zone_id: 'z1',
      mobile_surcharge: 40,
      mobile_address: long,
    });
    expect(result.address?.length).toBe(200);
  });

  it('throws MobileFieldsError instance (callers map by instanceof)', async () => {
    const sb = mockSupabaseWithZone({
      id: 'z1',
      name: 'Zone 1',
      surcharge: 40,
      is_available: true,
    });
    try {
      await resolveMobileFields(sb, { is_mobile: true });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MobileFieldsError);
    }
  });
});
