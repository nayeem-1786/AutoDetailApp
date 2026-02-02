import type { SupabaseClient } from '@supabase/supabase-js';
import type { Customer } from '@/lib/supabase/types';

/**
 * Server-side helper: get the Customer record linked to the current auth session.
 * Returns null if the user is not authenticated or is not a customer.
 */
export async function getCustomerFromSession(
  supabase: SupabaseClient
): Promise<Customer | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();

  return (customer as Customer) ?? null;
}
