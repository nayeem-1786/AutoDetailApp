import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildAudienceQuery } from '@/lib/utils/audience';
import type { CampaignChannel } from '@/lib/supabase/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: employee } = await supabase
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { filters = {}, channel = 'sms', limit = 50 } = body;

    const adminClient = createAdminClient();
    const { customerIds } = await buildAudienceQuery(
      adminClient,
      filters,
      channel as CampaignChannel
    );

    if (customerIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Fetch customer details for the sample (up to limit)
    const sampleIds = customerIds.slice(0, Math.min(limit, 50));
    const { data: customers } = await adminClient
      .from('customers')
      .select('id, first_name, last_name, phone, email')
      .in('id', sampleIds)
      .order('first_name');

    return NextResponse.json({ data: customers ?? [] });
  } catch (err) {
    console.error('Audience sample error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
