import { createAdminClient } from '@/lib/supabase/admin';

type EmailConsentSource =
  | 'mailgun_webhook'
  | 'admin_manual'
  | 'unsubscribe_page'
  | 'booking_form'
  | 'customer_portal'
  | 'system';

/**
 * Centralized email consent update helper.
 *
 * Modeled after updateSmsConsent() — updates the `email_consent` field
 * on the customer record with logging. Does not currently write to a
 * separate audit table (no email_consent_log table exists yet), but
 * logs changes to console for traceability.
 *
 * @param customerId - Customer UUID
 * @param consent - New consent value (true = opted in, false = opted out)
 * @param source - Where the consent change originated
 * @returns Object with changed flag and previous/new values
 */
export async function updateEmailConsent(
  customerId: string,
  consent: boolean,
  source: EmailConsentSource
): Promise<{ changed: boolean; previousValue?: boolean | null; newValue?: boolean; error?: string }> {
  const admin = createAdminClient();

  // Get current value for audit trail
  const { data: customer } = await admin
    .from('customers')
    .select('email_consent')
    .eq('id', customerId)
    .single();

  const previousValue = customer?.email_consent ?? null;

  // Skip if no change
  if (previousValue === consent) {
    console.log(`[EMAIL_CONSENT] No change: customer=${customerId} consent=${consent} source=${source}`);
    return { changed: false };
  }

  // Update customer record
  const { error: updateError } = await admin
    .from('customers')
    .update({ email_consent: consent, updated_at: new Date().toISOString() })
    .eq('id', customerId);

  if (updateError) {
    console.error('[EMAIL_CONSENT] Failed to update customer:', updateError);
    return { changed: false, error: updateError.message };
  }

  console.log(
    `[EMAIL_CONSENT] customer=${customerId} consent=${consent} source=${source} previous=${previousValue}`
  );

  return { changed: true, previousValue, newValue: consent };
}
