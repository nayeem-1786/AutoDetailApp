import { createAdminClient } from '@/lib/supabase/admin';
import type { QboSettings } from './types';

/** Read a single QBO setting from business_settings. */
export async function getQboSetting(key: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', key)
    .single();

  if (!data) return null;
  const val = data.value as string;
  // business_settings stores values as JSON strings (e.g. '"value"')
  return typeof val === 'string' ? val.replace(/^"|"$/g, '') : null;
}

/** Write a single QBO setting to business_settings. */
export async function setQboSetting(key: string, value: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('business_settings')
    .update({ value: JSON.stringify(value) })
    .eq('key', key);
}

/** Read all QBO settings as a typed QboSettings object. */
export async function getQboSettings(): Promise<QboSettings> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('business_settings')
    .select('key, value')
    .like('key', 'qbo_%');

  const raw: Record<string, string> = {};
  for (const row of data ?? []) {
    const val = row.value as string;
    raw[row.key] = typeof val === 'string' ? val.replace(/^"|"$/g, '') : '';
  }

  return {
    qbo_enabled: raw.qbo_enabled === 'true',
    qbo_environment: raw.qbo_environment === 'production' ? 'production' : 'sandbox',
    qbo_auto_sync_transactions: raw.qbo_auto_sync_transactions !== 'false',
    qbo_auto_sync_customers: raw.qbo_auto_sync_customers !== 'false',
    qbo_auto_sync_catalog: raw.qbo_auto_sync_catalog !== 'false',
    qbo_income_account_id: raw.qbo_income_account_id || '',
    qbo_default_payment_method_id: raw.qbo_default_payment_method_id || '',
    qbo_last_sync_at: raw.qbo_last_sync_at || '',
  };
}

/** Check if QBO is connected (has valid realm_id and tokens). */
export async function isQboConnected(): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', ['qbo_realm_id', 'qbo_access_token', 'qbo_refresh_token']);

  if (!data || data.length < 3) return false;

  return data.every((row) => {
    const val = row.value as string;
    const cleaned = typeof val === 'string' ? val.replace(/^"|"$/g, '') : '';
    return cleaned.length > 0;
  });
}

/** Check if QBO sync is enabled (feature toggle ON + connected). */
export async function isQboSyncEnabled(): Promise<boolean> {
  const supabase = createAdminClient();

  // Check feature flag
  const { data: flag } = await supabase
    .from('feature_flags')
    .select('enabled')
    .eq('key', 'qbo_enabled')
    .single();

  if (!flag?.enabled) return false;

  // Check connected
  return isQboConnected();
}

/** Clear all QBO tokens (for disconnect). */
export async function clearQboTokens(): Promise<void> {
  const supabase = createAdminClient();
  const keys = [
    'qbo_access_token',
    'qbo_refresh_token',
    'qbo_realm_id',
    'qbo_token_expires_at',
  ];

  for (const key of keys) {
    await supabase
      .from('business_settings')
      .update({ value: '""' })
      .eq('key', key);
  }
}
