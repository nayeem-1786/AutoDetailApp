import { NextRequest, NextResponse } from 'next/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const auth = authenticatePosRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', 'quote_validity_days')
    .maybeSingle();

  let days = 10;
  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value);
      if (typeof parsed === 'number' && parsed > 0) days = parsed;
    } catch { /* fallback */ }
  }

  return NextResponse.json({ quote_validity_days: days });
}
