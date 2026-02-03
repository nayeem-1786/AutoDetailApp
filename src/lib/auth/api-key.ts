import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Validate an API key from the Authorization: Bearer <key> header.
 * The expected key is stored in `business_settings` under `voice_agent_api_key`.
 */
export async function validateApiKey(
  request: NextRequest
): Promise<{ valid: boolean; error?: string }> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid Authorization header' };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { valid: false, error: 'Empty API key' };
  }

  const supabase = createAdminClient();

  const { data: setting } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', 'voice_agent_api_key')
    .single();

  if (!setting?.value) {
    return { valid: false, error: 'API key not configured' };
  }

  const expectedKey = typeof setting.value === 'string'
    ? setting.value.replace(/^"|"$/g, '')
    : String(setting.value);

  if (token !== expectedKey) {
    return { valid: false, error: 'Invalid API key' };
  }

  return { valid: true };
}
