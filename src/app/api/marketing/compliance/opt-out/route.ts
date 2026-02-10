import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateSmsConsent } from '@/lib/utils/sms-consent';

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

    if (channel === 'sms') {
      // Use shared SMS consent helper for audit trail
      const { data: cust } = await supabase
        .from('customers')
        .select('phone')
        .eq('id', customer_id)
        .single();

      if (cust?.phone) {
        await updateSmsConsent({
          customerId: customer_id,
          phone: cust.phone,
          action: 'opt_out',
          keyword: 'opt_out',
          source: 'admin_manual',
          notes: `Opted out by admin ${user.id}`,
        });
      } else {
        // No phone on record — still update the flag directly
        await supabase
          .from('customers')
          .update({ sms_consent: false })
          .eq('id', customer_id);
      }
    } else {
      // Email consent — update directly
      const { error: updateError } = await supabase
        .from('customers')
        .update({ email_consent: false })
        .eq('id', customer_id);

      if (updateError) throw updateError;
    }

    // Log consent change to marketing_consent_log (legacy)
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
