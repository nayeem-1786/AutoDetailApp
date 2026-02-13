import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { getBusinessInfo } from '@/lib/data/business';
import { getBusinessHours, type BusinessHours } from '@/lib/data/business-hours';
import { createShortLink } from '@/lib/utils/short-link';
import crypto from 'crypto';

/**
 * POST /api/pos/jobs/[id]/complete
 * Completes a job: stops timer, sets status, generates gallery token,
 * triggers customer notification (SMS with MMS + email).
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
    const body = await request.json().catch(() => ({}));

    // Fetch current job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        *,
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
        { error: `Cannot complete job in "${job.status}" status` },
        { status: 400 }
      );
    }

    // Calculate final timer seconds
    const now = new Date();
    let finalTimerSeconds = job.timer_seconds || 0;

    if (job.work_started_at && !job.timer_paused_at) {
      // Timer was running — accumulate remaining elapsed
      const elapsed = Math.floor((now.getTime() - new Date(job.work_started_at).getTime()) / 1000);
      finalTimerSeconds += elapsed;
    }

    // Generate gallery token
    const galleryToken = crypto.randomUUID();

    // Mark featured photos if provided, otherwise auto-select
    const featuredPhotoIds: string[] = body.featured_photo_ids || [];

    if (featuredPhotoIds.length > 0) {
      // User-selected featured photos
      await supabase
        .from('job_photos')
        .update({ is_featured: true })
        .in('id', featuredPhotoIds);
    } else {
      // Auto-select: first exterior intake + completion pair, first interior pair
      await autoSelectFeaturedPhotos(supabase, id);
    }

    // Update job
    const { data: updatedJob, error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'completed',
        work_completed_at: now.toISOString(),
        timer_seconds: finalTimerSeconds,
        timer_paused_at: null,
        gallery_token: galleryToken,
        updated_at: now.toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone, email),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color),
        assigned_staff:employees!jobs_assigned_staff_id_fkey(id, first_name, last_name),
        addons:job_addons(*)
      `)
      .single();

    if (updateError) {
      console.error('Job complete update error:', updateError);
      return NextResponse.json({ error: 'Failed to complete job' }, { status: 500 });
    }

    // Fire-and-forget: send customer notifications
    sendCompletionNotifications(supabase, updatedJob, galleryToken).catch((err) =>
      console.error('[JobComplete] Notification error:', err)
    );

    return NextResponse.json({ data: updatedJob });
  } catch (err) {
    console.error('Job complete route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Auto-select featured photos (first exterior + interior before/after pairs)
// ---------------------------------------------------------------------------

async function autoSelectFeaturedPhotos(
  supabase: ReturnType<typeof createAdminClient>,
  jobId: string
) {
  // Get all photos for this job
  const { data: photos } = await supabase
    .from('job_photos')
    .select('id, zone, phase, is_internal')
    .eq('job_id', jobId)
    .eq('is_internal', false)
    .order('sort_order', { ascending: true });

  if (!photos || photos.length === 0) return;

  const featureIds: string[] = [];

  // Find first exterior zone with both intake + completion
  const exteriorZones = [...new Set(photos.filter((p) => p.zone.startsWith('exterior_')).map((p) => p.zone))];
  for (const zone of exteriorZones) {
    const intake = photos.find((p) => p.zone === zone && p.phase === 'intake');
    const completion = photos.find((p) => p.zone === zone && p.phase === 'completion');
    if (intake && completion) {
      featureIds.push(intake.id, completion.id);
      break;
    }
  }

  // Find first interior zone with both intake + completion
  const interiorZones = [...new Set(photos.filter((p) => p.zone.startsWith('interior_')).map((p) => p.zone))];
  for (const zone of interiorZones) {
    const intake = photos.find((p) => p.zone === zone && p.phase === 'intake');
    const completion = photos.find((p) => p.zone === zone && p.phase === 'completion');
    if (intake && completion) {
      featureIds.push(intake.id, completion.id);
      break;
    }
  }

  if (featureIds.length > 0) {
    await supabase
      .from('job_photos')
      .update({ is_featured: true })
      .in('id', featureIds);
  }
}

// ---------------------------------------------------------------------------
// Send completion notifications (SMS + Email)
// ---------------------------------------------------------------------------

/**
 * Get today's closing time in PST, formatted as human-readable (e.g., "6:00 PM").
 */
function getTodayClosingTime(hours: BusinessHours | null): string | null {
  if (!hours) return null;
  const now = new Date();
  const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayKey = days[pst.getDay()];
  const dayHours = hours[dayKey];
  if (!dayHours) return null;

  const [h, m] = dayHours.close.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hour12}:00 ${ampm}` : `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

async function sendCompletionNotifications(
  supabase: ReturnType<typeof createAdminClient>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  job: any,
  galleryToken: string
) {
  const customer = job.customer;
  if (!customer) return;

  const businessInfo = await getBusinessInfo();
  const businessHours = await getBusinessHours();
  const closingTime = getTodayClosingTime(businessHours);
  const hoursLine = closingTime ? `Open today until ${closingTime}` : 'See our hours online';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const galleryUrl = `${appUrl}/jobs/${galleryToken}/photos`;

  let galleryLink = galleryUrl;
  try {
    galleryLink = await createShortLink(galleryUrl);
  } catch {
    // Fall back to full URL
  }

  // Vehicle: make + model only (no year), fallback to "your vehicle"
  const vehicleMakeModel = [job.vehicle?.make, job.vehicle?.model].filter(Boolean).join(' ');
  const vehicleDisplay = vehicleMakeModel || 'your vehicle';

  // Full vehicle info for email subject (with year)
  const vehicleFullParts = [job.vehicle?.year, job.vehicle?.make, job.vehicle?.model].filter(Boolean);
  const vehicleInfoFull = vehicleFullParts.length > 0 ? vehicleFullParts.join(' ') : 'Vehicle';

  // SMS notification — no MMS image
  if (customer.phone) {
    const smsBody = `Hi ${customer.first_name}, your ${vehicleDisplay} is looking great and ready for pickup! \u{1F389}\nView your before & after photos: ${galleryLink}\n${businessInfo.name}\n${businessInfo.address || ''}\n${businessInfo.phone || ''}\n${hoursLine}`;

    await sendSms(customer.phone, smsBody);
  }

  // Email notification
  if (customer.email) {
    // Get before/after photo pairs for email
    const { data: allFeatured } = await supabase
      .from('job_photos')
      .select('image_url, zone, phase')
      .eq('job_id', job.id)
      .eq('is_featured', true)
      .eq('is_internal', false)
      .order('zone')
      .order('phase');

    const photoPairs: Array<{ zone: string; before: string; after: string }> = [];
    if (allFeatured) {
      const byZone: Record<string, { intake?: string; completion?: string }> = {};
      for (const p of allFeatured) {
        if (!byZone[p.zone]) byZone[p.zone] = {};
        if (p.phase === 'intake') byZone[p.zone].intake = p.image_url;
        if (p.phase === 'completion') byZone[p.zone].completion = p.image_url;
      }
      for (const [zone, pair] of Object.entries(byZone)) {
        if (pair.intake && pair.completion) {
          photoPairs.push({ zone, before: pair.intake, after: pair.completion });
        }
      }
    }

    const services = (job.services as Array<{ name: string }>) || [];
    const servicesList = services.map((s) => s.name).join(', ');
    const timerMins = Math.round((job.timer_seconds || 0) / 60);
    const timerDisplay = timerMins >= 60
      ? `${Math.floor(timerMins / 60)}h ${timerMins % 60}m`
      : `${timerMins}m`;

    // Build approved addons list
    const approvedAddons = (job.addons || []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => a.status === 'approved'
    );

    const photoHtml = photoPairs.map((pair) => `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
        <tr>
          <td width="49%" style="padding-right: 4px;">
            <div style="text-align:center;font-size:11px;color:#999;margin-bottom:4px;">BEFORE</div>
            <img src="${pair.before}" alt="Before" style="width:100%;border-radius:8px;" />
          </td>
          <td width="2%"></td>
          <td width="49%" style="padding-left: 4px;">
            <div style="text-align:center;font-size:11px;color:#999;margin-bottom:4px;">AFTER</div>
            <img src="${pair.after}" alt="After" style="width:100%;border-radius:8px;" />
          </td>
        </tr>
      </table>
    `).join('');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addonsHtml = approvedAddons.length > 0 ? `
      <p style="margin-top: 8px; font-size: 14px; color: #374151;">
        <strong>Add-ons:</strong><br/>
        ${approvedAddons.map((a: { custom_description: string | null; price: number; discount_amount: number }) =>
          `${a.custom_description || 'Service'} — $${(a.price - a.discount_amount).toFixed(2)}`
        ).join('<br/>')}
      </p>
    ` : '';

    const subject = `Your ${vehicleDisplay} is Ready!`;
    const plainText = `Hi ${customer.first_name}, your ${vehicleDisplay} is looking great and ready for pickup!\n\nServices: ${servicesList}\nTime: ${timerDisplay}\n\nView your photos: ${galleryUrl}\n\n${businessInfo.name}\n${businessInfo.address || ''}\n${businessInfo.phone || ''}\n${hoursLine}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h1 style="font-size: 24px; color: #111827; margin-bottom: 8px;">Your ${vehicleDisplay} is Ready!</h1>
        <p style="font-size: 16px; color: #374151; margin-bottom: 24px;">
          Hi ${customer.first_name}! Great news — your ${vehicleDisplay} is looking great and ready for pickup.
        </p>

        ${photoHtml}

        <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin: 24px 0;">
          <p style="margin: 0; font-size: 14px; color: #374151;">
            <strong>Services:</strong> ${servicesList}
          </p>
          <p style="margin: 4px 0 0; font-size: 14px; color: #6b7280;">
            Total time: ${timerDisplay}
          </p>
          ${addonsHtml}
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${galleryUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            View All Photos
          </a>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="font-size: 13px; color: #9ca3af; text-align: center;">
          ${businessInfo.name}<br/>
          ${businessInfo.address ? `${businessInfo.address}<br/>` : ''}
          ${businessInfo.phone || ''}<br/>
          ${hoursLine}
        </p>
      </div>
    `;

    await sendEmail(customer.email, subject, plainText, html);
  }
}
