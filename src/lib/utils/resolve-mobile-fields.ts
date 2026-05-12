import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared mobile-fields resolver — Phase Mobile-1.9.
 *
 * Generic version of `resolveMobileForQuote` extracted from
 * `src/lib/quotes/quote-service.ts`. Validates the five mobile fields on
 * a quote OR appointment write and snapshots zone name + surcharge from
 * the LIVE `mobile_zones` row at save time (Option α — historical
 * accuracy, see Phase Mobile-1 / `docs/sessions/mobile-fee-fix.md`).
 *
 * Why a separate module:
 *  - The Phase Mobile-1.9 mobile-service PATCH endpoint (POS + admin)
 *    needs the same zone re-fetch + surcharge re-validation that the
 *    booking and quote paths already enforce. Duplicating the rules
 *    risks drift between three places.
 *  - `quote-service.ts` continues to expose `resolveMobileForQuote`
 *    as a thin wrapper that re-throws as `QuoteValidationError` for
 *    its existing consumers (no breaking change).
 *
 * Throws `MobileFieldsError` on any validation failure. Callers map the
 * message to their endpoint's error response.
 */

export class MobileFieldsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MobileFieldsError';
  }
}

export interface MobileFieldsInput {
  is_mobile?: boolean;
  mobile_zone_id?: string | null;
  mobile_address?: string | null;
  mobile_surcharge?: number | string | null;
  mobile_zone_name_snapshot?: string | null;
  /**
   * Distinguishes "Custom path" (cashier-supplied surcharge + label) from
   * "no zone selected" when `mobile_zone_id` is null. Optional; defaults
   * to false for backward compat with older clients (validation will
   * then require a zone id when is_mobile=true).
   */
  is_custom?: boolean;
}

export interface ResolvedMobileFields {
  isMobile: boolean;
  zoneId: string | null;
  address: string | null;
  surcharge: number;
  snapshotName: string | null;
}

const MAX_ADDRESS_LENGTH = 200;
const MAX_LABEL_LENGTH = 100;
const MAX_CUSTOM_SURCHARGE = 500;

export async function resolveMobileFields(
  supabase: SupabaseClient,
  data: MobileFieldsInput
): Promise<ResolvedMobileFields> {
  if (!data.is_mobile) {
    return {
      isMobile: false,
      zoneId: null,
      address: null,
      surcharge: 0,
      snapshotName: null,
    };
  }

  const address = (data.mobile_address ?? '').trim();
  if (!address) {
    throw new MobileFieldsError('Address is required for mobile service');
  }

  if (data.mobile_zone_id) {
    const { data: zone, error: zoneErr } = await supabase
      .from('mobile_zones')
      .select('id, name, surcharge, is_available')
      .eq('id', data.mobile_zone_id)
      .single();
    if (zoneErr || !zone) {
      throw new MobileFieldsError('Invalid mobile zone');
    }
    if (!zone.is_available) {
      throw new MobileFieldsError('Mobile zone is not available');
    }
    const clientSurcharge = Number(data.mobile_surcharge ?? 0);
    if (Math.abs(Number(zone.surcharge) - clientSurcharge) > 0.01) {
      throw new MobileFieldsError(
        'Mobile surcharge mismatch — please refresh and try again'
      );
    }
    return {
      isMobile: true,
      zoneId: zone.id,
      address: address.slice(0, MAX_ADDRESS_LENGTH),
      surcharge: Number(zone.surcharge),
      snapshotName: zone.name,
    };
  }

  // No zone id — distinguish "Custom path" from "placeholder still
  // showing" via the is_custom client flag (Phase Mobile-1.2 rationale).
  if (data.is_custom !== true) {
    throw new MobileFieldsError(
      'Please select a service area for the mobile fee'
    );
  }
  const customAmount = Number(data.mobile_surcharge ?? 0);
  if (!(customAmount > 0) || customAmount > MAX_CUSTOM_SURCHARGE) {
    throw new MobileFieldsError('Enter a custom fee between $1 and $500');
  }
  const surcharge = Math.round(customAmount * 100) / 100;
  const label = (data.mobile_zone_name_snapshot ?? '').trim().slice(0, MAX_LABEL_LENGTH);
  return {
    isMobile: true,
    zoneId: null,
    address: address.slice(0, MAX_ADDRESS_LENGTH),
    surcharge,
    snapshotName: label || 'Custom',
  };
}
