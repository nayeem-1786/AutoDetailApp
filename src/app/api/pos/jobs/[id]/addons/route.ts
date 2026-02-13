import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { getBusinessInfo } from '@/lib/data/business';
import { getAnnotatedPhotoUrl } from '@/lib/utils/render-annotations';
import { getIssueHumanReadable, friendlyServiceName } from '@/lib/utils/issue-types';
import type { IssueType } from '@/lib/supabase/types';

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
      issue_type = null,
      issue_description = null,
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
        issue_type: issue_type || null,
        issue_description: issue_description || null,
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
    const finalPrice = price - discount_amount;

    // Get the detailer's first name
    const { data: detailerEmployee } = await supabase
      .from('employees')
      .select('first_name')
      .eq('id', posEmployee.employee_id)
      .single();
    const detailerName = detailerEmployee?.first_name || 'Your detailer';

    // Build vehicle description (make model only, no year/color for SMS)
    const vehicle = job.vehicle as unknown as { year: number | null; make: string | null; model: string | null; color: string | null } | null;
    const vehicleDesc = vehicle && (vehicle.make || vehicle.model)
      ? [vehicle.make, vehicle.model].filter(Boolean).join(' ')
      : 'your vehicle';

    // Build issue description for SMS
    const issueText = getIssueHumanReadable(issue_type as IssueType | null, issue_description);

    // Get service/product name for friendly description
    let catalogItemName: string | null = null;
    if (service_id) {
      const { data: svc } = await supabase.from('services').select('name').eq('id', service_id).single();
      catalogItemName = svc?.name ?? null;
    } else if (product_id) {
      const { data: prod } = await supabase.from('products').select('name').eq('id', product_id).single();
      catalogItemName = prod?.name ?? null;
    }
    const friendlyName = catalogItemName
      ? friendlyServiceName(catalogItemName)
      : (custom_description || 'an additional service');

    // Get annotated photo URL for email only (NOT for MMS — removed per spec)
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

    // Send SMS — conversational tone, NO mediaUrl
    if (customer?.phone) {
      const smsBody = [
        `Hi ${customer.first_name}, while working on your ${vehicleDesc} we noticed ${issueText}.`,
        `We recommend ${friendlyName} for an additional $${finalPrice.toFixed(2)} — shall we go ahead?`,
        `View pictures and approve or decline here: ${authorizeUrl}`,
        detailerName,
        biz.name,
      ].join('\n');

      const smsResult = await sendSms(customer.phone, smsBody, {
        customerId: customer.id,
        source: 'transactional',
      });
      if (smsResult.success) {
        notifiedVia.push('sms');
      }
    }

    // Send email
    if (customer?.email) {
      const htmlBody = buildAuthorizationEmail({
        businessName: biz.name,
        businessLogo: biz.logo_url,
        customerName: customer.first_name,
        issueText,
        friendlyServiceName: friendlyName,
        detailerName,
        vehicleDesc,
        price,
        discountAmount: discount_amount,
        finalPrice,
        pickupDelay: pickup_delay_minutes,
        expirationMinutes,
        photoUrl,
        authorizeUrl,
      });

      const emailResult = await sendEmail(
        customer.email,
        `Additional Service Authorization — ${biz.name}`,
        [
          `Hi ${customer.first_name},`,
          `While working on your ${vehicleDesc}, we noticed ${issueText}.`,
          `We recommend ${friendlyName} for an additional $${finalPrice.toFixed(2)}.`,
          `Approve: ${authorizeUrl}`,
          `— ${detailerName}, ${biz.name}`,
        ].join('\n\n'),
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
  issueText: string;
  friendlyServiceName: string;
  detailerName: string;
  vehicleDesc: string;
  price: number;
  discountAmount: number;
  finalPrice: number;
  pickupDelay: number;
  expirationMinutes: number;
  photoUrl: string | null;
  authorizeUrl: string;
}): string {
  const {
    businessName,
    businessLogo,
    customerName,
    issueText,
    friendlyServiceName: friendly,
    detailerName,
    vehicleDesc,
    price,
    discountAmount,
    finalPrice,
    pickupDelay,
    expirationMinutes,
    photoUrl,
    authorizeUrl,
  } = params;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Additional Service Authorization</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

<!-- Header -->
<tr><td style="background-color:#1e40af;padding:24px;text-align:center;">
${businessLogo ? `<img src="${businessLogo}" alt="${businessName}" style="height:48px;margin-bottom:12px;">` : ''}
<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">${businessName}</h1>
<p style="margin:4px 0 0;color:#93c5fd;font-size:14px;">Additional Service Authorization</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:24px;">
<p style="margin:0 0 16px;color:#374151;font-size:15px;">Hi ${customerName},</p>
<p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
While working on your ${vehicleDesc}, ${detailerName} noticed ${issueText}.<br>
We'd like to take care of it while your vehicle is already here.
</p>

${photoUrl ? `
<div style="margin:0 0 20px;text-align:center;">
<p style="margin:0 0 8px;color:#6b7280;font-size:13px;font-weight:500;">Photos from our inspection</p>
<img src="${photoUrl}" alt="Inspection photo" style="max-width:100%;border-radius:8px;border:1px solid #e5e7eb;">
</div>
` : ''}

<!-- Proposed service -->
<table role="presentation" width="100%" style="background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:20px;">
<tr><td style="padding:16px;">
<p style="margin:0 0 4px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Proposed Add-On Service</p>
<p style="margin:0 0 8px;color:#111827;font-size:15px;font-weight:600;">${friendly}</p>
${discountAmount > 0 ? `
<p style="margin:0;color:#6b7280;font-size:14px;">Original price: <span style="text-decoration:line-through;">$${price.toFixed(2)}</span></p>
<p style="margin:4px 0 0;color:#059669;font-size:14px;">Discount: -$${discountAmount.toFixed(2)}</p>
<p style="margin:8px 0 0;color:#111827;font-size:22px;font-weight:700;">Additional Cost: $${finalPrice.toFixed(2)}</p>
` : `
<p style="margin:0;color:#111827;font-size:22px;font-weight:700;">Additional Cost: $${finalPrice.toFixed(2)}</p>
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
</p>
</td></tr>

<!-- Footer -->
<tr><td style="border-top:1px solid #e5e7eb;padding:16px;text-align:center;">
<p style="margin:0;color:#6b7280;font-size:12px;">— ${detailerName}</p>
<p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">${businessName}</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`.trim();
}
