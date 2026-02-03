import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { previewAudienceCount } from '@/lib/utils/audience';
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
    const { filters = {}, channel = 'sms' } = body;

    const adminClient = createAdminClient();
    const { totalMatch, consentEligible } = await previewAudienceCount(
      adminClient,
      filters,
      channel as CampaignChannel
    );

    return NextResponse.json({
      data: { count: consentEligible, totalMatch, consentEligible },
    });
  } catch (err) {
    console.error('Audience preview error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
