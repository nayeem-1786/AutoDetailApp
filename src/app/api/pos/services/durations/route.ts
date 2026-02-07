import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

export async function POST(request: NextRequest) {
  const posEmployee = authenticatePosRequest(request);
  if (!posEmployee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { service_ids } = await request.json();
    if (!Array.isArray(service_ids) || service_ids.length === 0) {
      return NextResponse.json({ durations: {} });
    }

    const supabase = createAdminClient();
    const { data } = await supabase
      .from('services')
      .select('id, base_duration_minutes')
      .in('id', service_ids);

    const durations: Record<string, number> = {};
    for (const s of data || []) {
      durations[s.id] = s.base_duration_minutes;
    }

    return NextResponse.json({ durations });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
