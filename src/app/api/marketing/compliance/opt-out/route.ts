import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    const { customer_id, channel } = body;

    if (!customer_id || !channel) {
      return NextResponse.json(
        { error: 'customer_id and channel are required' },
        { status: 400 }
      );
    }

    if (!['sms', 'email'].includes(channel)) {
      return NextResponse.json(
        { error: 'channel must be sms or email' },
        { status: 400 }
      );
    }

    // Update customer consent
    const consentField = channel === 'sms' ? 'sms_consent' : 'email_consent';
    const { error: updateError } = await supabase
      .from('customers')
      .update({ [consentField]: false })
      .eq('id', customer_id);

    if (updateError) throw updateError;

    // Log consent change
    const { error: logError } = await supabase
      .from('marketing_consent_log')
      .insert({
        customer_id,
        channel,
        action: 'opt_out',
        source: 'manual',
        recorded_by: user.id,
      });

    if (logError) throw logError;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Opt-out error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
