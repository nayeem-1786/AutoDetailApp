import { createAdminClient } from '@/lib/supabase/admin';

interface ConsentChangeParams {
  customerId: string;
  phone: string;
  action: 'opt_out' | 'opt_in';
  keyword: string;
  source: 'inbound_sms' | 'admin_manual' | 'unsubscribe_page' | 'booking_form' | 'customer_portal' | 'system';
  notes?: string;
}

export async function updateSmsConsent(params: ConsentChangeParams) {
  const admin = createAdminClient();
  const newValue = params.action === 'opt_in';

  // Get current value for audit trail
  const { data: customer } = await admin
    .from('customers')
    .select('sms_consent')
    .eq('id', params.customerId)
    .single();

  const previousValue = customer?.sms_consent ?? null;

  // Skip if no change
  if (previousValue === newValue) return { changed: false };

  // Update customer record
  const { error: updateError } = await admin
    .from('customers')
    .update({ sms_consent: newValue, updated_at: new Date().toISOString() })
    .eq('id', params.customerId);

  if (updateError) {
    console.error('[SMS_CONSENT] Failed to update customer:', updateError);
    return { changed: false, error: updateError.message };
  }

  // Log to audit table
  const { error: logError } = await admin
    .from('sms_consent_log')
    .insert({
      customer_id: params.customerId,
      phone: params.phone,
      action: params.action,
      keyword: params.keyword,
      source: params.source,
      previous_value: previousValue,
      new_value: newValue,
      notes: params.notes || null,
    });

  if (logError) {
    console.error('[SMS_CONSENT] Failed to log consent change:', logError);
  }

  console.log(`[SMS_CONSENT] ${params.action.toUpperCase()}: customer=${params.customerId} phone=${params.phone} keyword=${params.keyword} source=${params.source}`);

  return { changed: true, previousValue, newValue };
}
