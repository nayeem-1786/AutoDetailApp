// Phase Mobile-1.1 — server-side helper for computing the
// `mobile_address_action` response shape returned by POS jobs / POS quotes /
// public booking when a mobile address is entered with a linked customer.
//
// Two outcomes:
//   silently_saved=true  → server has already written the parsed address to
//                          customers.address_line_1...zip (customer had no
//                          profile address on file — LOCKED-7). Client shows
//                          a non-blocking toast.
//   diff=true            → entered address differs from the customer's
//                          existing profile address. Client surfaces the
//                          conflict prompt (POS dialog or thank-you banner).
//
// Both false → entered matches profile, or customer/mobile not applicable.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatCustomerAddress,
  normalizeAddressForCompare,
  parseAddressString,
  type CustomerLike,
} from './format-address';

export interface MobileAddressAction {
  diff: boolean;
  silently_saved: boolean;
  current_profile_address: string | null;
  entered_address: string;
  customer_id: string;
}

interface ResolveOpts {
  customerId: string | null;
  isMobile: boolean;
  enteredAddress: string | null;
}

/**
 * Resolve the post-success address action. Performs the silent-save UPDATE
 * atomically when applicable. Caller passes the live admin client so the
 * UPDATE shares the same DB connection as the parent transaction
 * (best-effort — Supabase doesn't expose transactions over PostgREST).
 *
 * Returns null when the action is N/A (no customer, mobile off, empty
 * entered address). Returns a MobileAddressAction otherwise — even when
 * neither diff nor silently_saved is true, so the client can introspect.
 */
export async function resolveMobileAddressAction(
  supabase: SupabaseClient,
  opts: ResolveOpts
): Promise<MobileAddressAction | null> {
  const entered = (opts.enteredAddress ?? '').trim();
  if (!opts.isMobile || !opts.customerId || !entered) return null;

  // Fetch the customer's current profile address.
  const { data: customer, error } = await supabase
    .from('customers')
    .select('id, address_line_1, address_line_2, city, state, zip')
    .eq('id', opts.customerId)
    .is('deleted_at', null)
    .single();

  if (error || !customer) return null;

  const profile: CustomerLike = customer as CustomerLike;
  const currentFormatted = formatCustomerAddress(profile);

  // Silent-save path: customer has no profile address — first time we see
  // one. Parse + UPDATE atomically.
  if (!currentFormatted) {
    const parsed = parseAddressString(entered);
    await supabase
      .from('customers')
      .update({
        address_line_1: parsed.address_line_1 || entered.slice(0, 200),
        address_line_2: parsed.address_line_2,
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.customerId);

    return {
      diff: false,
      silently_saved: true,
      current_profile_address: null,
      entered_address: entered,
      customer_id: opts.customerId,
    };
  }

  // Diff detection: compare normalized strings.
  const enteredNorm = normalizeAddressForCompare(entered);
  const profileNorm = normalizeAddressForCompare(currentFormatted);
  const diff = enteredNorm !== profileNorm;

  return {
    diff,
    silently_saved: false,
    current_profile_address: currentFormatted,
    entered_address: entered,
    customer_id: opts.customerId,
  };
}
