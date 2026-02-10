import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateSmsConsent } from '@/lib/utils/sms-consent';
import { z } from 'zod';

const prefsSchema = z.object({
  sms_consent: z.boolean(),
  email_consent: z.boolean(),
  notify_promotions: z.boolean(),
  notify_loyalty: z.boolean(),
});

// GET - fetch current preferences (no auth required)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await params;
    const supabase = createAdminClient();

    const { data: customer, error } = await supabase
      .from('customers')
      .select('sms_consent, email_consent, notify_promotions, notify_loyalty')
      .eq('id', customerId)
      .single();

    if (error || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        sms_consent: customer.sms_consent,
        email_consent: customer.email_consent,
        notify_promotions: customer.notify_promotions ?? true,
        notify_loyalty: customer.notify_loyalty ?? true,
      },
    });
  } catch (err) {
    console.error('Unsubscribe GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - update preferences (no auth required)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await params;
    const body = await request.json();

    const parsed = prefsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch current customer state
    const { data: existing } = await supabase
      .from('customers')
      .select('id, phone, sms_consent')
      .eq('id', customerId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Log SMS consent change via audit trail if it changed
    if (existing.sms_consent !== parsed.data.sms_consent && existing.phone) {
      await updateSmsConsent({
        customerId,
        phone: existing.phone,
        action: parsed.data.sms_consent ? 'opt_in' : 'opt_out',
        keyword: parsed.data.sms_consent ? 'opt_in' : 'opt_out',
        source: 'unsubscribe_page',
      });
    }

    // Update remaining fields (sms_consent already updated by updateSmsConsent if changed)
    const { error: updateErr } = await supabase
      .from('customers')
      .update({
        sms_consent: parsed.data.sms_consent,
        email_consent: parsed.data.email_consent,
        notify_promotions: parsed.data.notify_promotions,
        notify_loyalty: parsed.data.notify_loyalty,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId);

    if (updateErr) {
      console.error('Unsubscribe update failed:', updateErr);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Unsubscribe PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
