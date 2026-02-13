import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { getBusinessInfo } from '@/lib/data/business';
import { getAnnotatedPhotoUrl } from '@/lib/utils/render-annotations';

/**
 * GET /api/pos/jobs/[id]/addons — List addons for a job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Expire any stale pending addons
    const now = new Date().toISOString();
    await supabase
      .from('job_addons')
      .update({ status: 'expired', responded_at: now })
      .eq('job_id', id)
      .eq('status', 'pending')
      .lt('expires_at', now);

    const { data: addons, error } = await supabase
      .from('job_addons')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('List addons error:', error);
      return NextResponse.json({ error: 'Failed to fetch addons' }, { status: 500 });
    }

    return NextResponse.json({ data: addons });
  } catch (err) {
    console.error('List addons route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/pos/jobs/[id]/addons — Create an addon + send notifications
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const body = await request.json();

    // Verify job exists and is in_progress
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        id, status, customer_id, estimated_pickup_at,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone, email),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color)
      `)
      .eq('id', id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Can only flag issues on in-progress jobs' },
        { status: 400 }
      );
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

    const {
      service_id,
      product_id,
      custom_description,
      price,
      discount_amount = 0,
      pickup_delay_minutes = 0,
      message_to_customer,
      photo_ids = [],
    } = body;

    // Create the addon record
    const { data: addon, error: createError } = await supabase
      .from('job_addons')
      .insert({
        job_id: id,
        service_id: service_id || null,
        product_id: product_id || null,
        custom_description: custom_description || null,
        price,
        discount_amount,
        status: 'pending',
        authorization_token: authToken,
        message_to_customer,
        sent_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        pickup_delay_minutes,
        photo_ids,
        customer_notified_via: [],
        created_by: posEmployee.employee_id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Create addon error:', createError);
      return NextResponse.json({ error: 'Failed to create addon' }, { status: 500 });
    }

    // Update estimated pickup if currently set
    if (job.estimated_pickup_at && pickup_delay_minutes > 0) {
      const currentPickup = new Date(job.estimated_pickup_at);
      const newPickup = new Date(currentPickup.getTime() + pickup_delay_minutes * 60000);
      await supabase
        .from('jobs')
        .update({
          estimated_pickup_at: newPickup.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', id);
    }

    // Send notifications
    const customer = job.customer as unknown as { id: string; first_name: string; last_name: string; phone: string | null; email: string | null } | null;
    const notifiedVia: string[] = [];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const authorizeUrl = `${appUrl}/authorize/${authToken}`;
    const biz = await getBusinessInfo();

    // Get the first photo URL for MMS (with annotations rendered onto image)
    let photoUrl: string | null = null;
    if (photo_ids.length > 0) {
      const { data: photo } = await supabase
        .from('job_photos')
        .select('id, image_url, annotation_data')
        .eq('id', photo_ids[0])
        .single();
      if (photo?.image_url) {
        photoUrl = await getAnnotatedPhotoUrl(supabase, photo, id);
      }
    }

    // Send SMS
    if (customer?.phone) {
      const smsBody = `${message_to_customer}\n\nApprove or decline here: ${authorizeUrl}\n\n— ${biz.name}`;
      const smsResult = await sendSms(customer.phone, smsBody, {
        customerId: customer.id,
        source: 'transactional',
        mediaUrl: photoUrl || undefined,
      });
      if (smsResult.success) {
        notifiedVia.push('sms');
      }
    }

    // Send email
    if (customer?.email) {
      const finalPrice = price - discount_amount;
      const vehicle = job.vehicle as unknown as { year: number | null; make: string | null; model: string | null; color: string | null } | null;
      const vehicleDesc = vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') : 'your vehicle';

      const htmlBody = buildAuthorizationEmail({
        businessName: biz.name,
        businessLogo: biz.logo_url,
        customerName: customer.first_name,
        message: message_to_customer || '',
        price,
        discountAmount: discount_amount,
        finalPrice,
        pickupDelay: pickup_delay_minutes,
        expirationMinutes,
        vehicleDesc,
        photoUrl,
        authorizeUrl,
      });

      const emailResult = await sendEmail(
        customer.email,
        `Authorization Request — ${biz.name}`,
        `${message_to_customer}\n\nApprove: ${authorizeUrl}\n\nPrice: $${finalPrice.toFixed(2)}${pickup_delay_minutes > 0 ? `\nAdditional time: +${pickup_delay_minutes} minutes` : ''}`,
        htmlBody
      );
      if (emailResult.success) {
        notifiedVia.push('email');
      }
    }

    // Update addon with notification channels used
    if (notifiedVia.length > 0) {
      await supabase
        .from('job_addons')
        .update({ customer_notified_via: notifiedVia })
        .eq('id', addon.id);
    }

    return NextResponse.json({ data: { ...addon, customer_notified_via: notifiedVia } });
  } catch (err) {
    console.error('Create addon route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Email template builder
// ---------------------------------------------------------------------------

function buildAuthorizationEmail(params: {
  businessName: string;
  businessLogo: string | null;
  customerName: string;
  message: string;
  price: number;
  discountAmount: number;
  finalPrice: number;
  pickupDelay: number;
  expirationMinutes: number;
  vehicleDesc: string;
  photoUrl: string | null;
  authorizeUrl: string;
}): string {
  const {
    businessName,
    businessLogo,
    customerName,
    message,
    price,
    discountAmount,
    finalPrice,
    pickupDelay,
    expirationMinutes,
    vehicleDesc,
    photoUrl,
    authorizeUrl,
  } = params;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Authorization Request</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

<!-- Header -->
<tr><td style="background-color:#1e40af;padding:24px;text-align:center;">
${businessLogo ? `<img src="${businessLogo}" alt="${businessName}" style="height:48px;margin-bottom:12px;">` : ''}
<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${businessName}</h1>
<p style="margin:4px 0 0;color:#93c5fd;font-size:14px;">Service Authorization Request</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:24px;">
<p style="margin:0 0 16px;color:#374151;font-size:15px;">Hi ${customerName},</p>
<p style="margin:0 0 20px;color:#374151;font-size:15px;">${message}</p>

${photoUrl ? `
<div style="margin:0 0 20px;text-align:center;">
<img src="${photoUrl}" alt="Issue photo" style="max-width:100%;border-radius:8px;border:1px solid #e5e7eb;">
</div>
` : ''}

<!-- Price box -->
<table role="presentation" width="100%" style="background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:20px;">
<tr><td style="padding:16px;">
<p style="margin:0 0 4px;color:#6b7280;font-size:13px;font-weight:500;">Vehicle: ${vehicleDesc}</p>
${discountAmount > 0 ? `
<p style="margin:8px 0 0;color:#6b7280;font-size:14px;">Original price: <span style="text-decoration:line-through;">$${price.toFixed(2)}</span></p>
<p style="margin:4px 0 0;color:#059669;font-size:14px;">Discount: -$${discountAmount.toFixed(2)}</p>
<p style="margin:8px 0 0;color:#111827;font-size:20px;font-weight:700;">$${finalPrice.toFixed(2)}</p>
` : `
<p style="margin:8px 0 0;color:#111827;font-size:20px;font-weight:700;">$${finalPrice.toFixed(2)}</p>
`}
${pickupDelay > 0 ? `<p style="margin:8px 0 0;color:#6b7280;font-size:13px;">Estimated additional time: +${pickupDelay} minutes</p>` : ''}
</td></tr>
</table>

<!-- CTA Buttons -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:0 4px 0 0;width:50%;">
<a href="${authorizeUrl}?action=approve" style="display:block;background-color:#16a34a;color:#ffffff;text-align:center;padding:14px 24px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;">Approve</a>
</td>
<td style="padding:0 0 0 4px;width:50%;">
<a href="${authorizeUrl}?action=decline" style="display:block;background-color:#ffffff;color:#dc2626;text-align:center;padding:14px 24px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;border:2px solid #dc2626;">Decline</a>
</td>
</tr>
</table>

<p style="margin:20px 0 0;color:#9ca3af;font-size:12px;text-align:center;">
This authorization expires in ${expirationMinutes} minutes.
If you have questions, contact us at ${businessName}.
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`.trim();
}
