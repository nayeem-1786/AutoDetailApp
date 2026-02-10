import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { customerProfileSchema } from '@/lib/utils/validation';
import { normalizePhone } from '@/lib/utils/format';
import { updateSmsConsent } from '@/lib/utils/sms-consent';

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = customerProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const admin = createAdminClient();

    // Find the customer record for this auth user
    const { data: customer } = await admin
      .from('customers')
      .select('id, phone, sms_consent')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer record not found' },
        { status: 404 }
      );
    }

    const e164Phone = normalizePhone(data.phone);

    // Log SMS consent change if it changed
    if (customer.sms_consent !== data.sms_consent) {
      const consentPhone = e164Phone || customer.phone;
      if (consentPhone) {
        await updateSmsConsent({
          customerId: customer.id,
          phone: consentPhone,
          action: data.sms_consent ? 'opt_in' : 'opt_out',
          keyword: data.sms_consent ? 'opt_in' : 'opt_out',
          source: 'customer_portal',
        });
      }
    }

    const { error: updateErr } = await admin
      .from('customers')
      .update({
        first_name: data.first_name,
        last_name: data.last_name,
        phone: e164Phone,
        sms_consent: data.sms_consent,
        email_consent: data.email_consent,
        notify_promotions: data.notify_promotions,
        notify_loyalty: data.notify_loyalty,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customer.id);

    if (updateErr) {
      console.error('Profile update failed:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Profile update error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
