import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { getBusinessInfo } from '@/lib/data/business';
import { getAnnotatedPhotoUrl } from '@/lib/utils/render-annotations';

/**
 * POST /api/pos/jobs/[id]/addons/[addonId]/resend
 * Re-sends an expired addon as a new addon with a fresh token and expiration.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; addonId: string }> }
) {
  try {
    const { id, addonId } = await params;
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Fetch the original addon
    const { data: original, error: fetchError } = await supabase
      .from('job_addons')
      .select('*')
      .eq('id', addonId)
      .eq('job_id', id)
      .single();

    if (fetchError || !original) {
      return NextResponse.json({ error: 'Addon not found' }, { status: 404 });
    }

    if (original.status !== 'expired' && original.status !== 'declined') {
      return NextResponse.json(
        { error: `Can only re-send expired or declined addons (current: "${original.status}")` },
        { status: 400 }
      );
    }

    // Fetch job for customer info
    const { data: job } = await supabase
      .from('jobs')
      .select(`
        id, estimated_pickup_at,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone, email),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color)
      `)
      .eq('id', id)
      .single();

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Get expiration setting
    const { data: expSetting } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'addon_auth_expiration_minutes')
      .single();

    const rawExp = expSetting?.value;
    const expirationMinutes = parseInt(
      typeof rawExp === 'string' ? rawExp.replace(/"/g, '') : String(rawExp ?? '30'),
      10
    ) || 30;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expirationMinutes * 60000);
    const authToken = crypto.randomUUID();

    // Create a new addon record (clone from original)
    const { data: newAddon, error: createError } = await supabase
      .from('job_addons')
      .insert({
        job_id: id,
        service_id: original.service_id,
        product_id: original.product_id,
        custom_description: original.custom_description,
        price: original.price,
        discount_amount: original.discount_amount,
        status: 'pending',
        authorization_token: authToken,
        message_to_customer: original.message_to_customer,
        sent_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        pickup_delay_minutes: original.pickup_delay_minutes,
        photo_ids: original.photo_ids,
        customer_notified_via: [],
        created_by: posEmployee.employee_id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Resend addon create error:', createError);
      return NextResponse.json({ error: 'Failed to create resend addon' }, { status: 500 });
    }

    // Send notifications
    const customer = job.customer as unknown as { id: string; first_name: string; last_name: string; phone: string | null; email: string | null } | null;
    const notifiedVia: string[] = [];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const authorizeUrl = `${appUrl}/authorize/${authToken}`;
    const biz = await getBusinessInfo();

    // Get photo URL for MMS (with annotations rendered onto image)
    let photoUrl: string | null = null;
    if (original.photo_ids?.length > 0) {
      const { data: photo } = await supabase
        .from('job_photos')
        .select('id, image_url, annotation_data')
        .eq('id', original.photo_ids[0])
        .single();
      if (photo?.image_url) {
        photoUrl = await getAnnotatedPhotoUrl(supabase, photo, id);
      }
    }

    if (customer?.phone) {
      const smsBody = `${original.message_to_customer}\n\nApprove or decline here: ${authorizeUrl}\n\n— ${biz.name}`;
      const smsResult = await sendSms(customer.phone, smsBody, {
        customerId: customer.id,
        source: 'transactional',
        mediaUrl: photoUrl || undefined,
      });
      if (smsResult.success) notifiedVia.push('sms');
    }

    if (customer?.email) {
      const finalPrice = original.price - original.discount_amount;
      const emailResult = await sendEmail(
        customer.email,
        `Authorization Request — ${biz.name}`,
        `${original.message_to_customer}\n\nApprove: ${authorizeUrl}\n\nPrice: $${finalPrice.toFixed(2)}`,
      );
      if (emailResult.success) notifiedVia.push('email');
    }

    if (notifiedVia.length > 0) {
      await supabase
        .from('job_addons')
        .update({ customer_notified_via: notifiedVia })
        .eq('id', newAddon.id);
    }

    return NextResponse.json({ data: { ...newAddon, customer_notified_via: notifiedVia } });
  } catch (err) {
    console.error('Resend addon route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
