import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getZoneLabel } from '@/lib/utils/job-zones';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // Auth: cookie-based customer session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Fetch the job — verify it belongs to this customer
    const { data: job, error: jobError } = await admin
      .from('jobs')
      .select(`
        id, status, services, created_at, gallery_token,
        timer_seconds, work_started_at, timer_paused_at,
        actual_pickup_at,
        vehicle_id, assigned_staff_id, customer_id,
        vehicles(id, year, make, model, color),
        employees:assigned_staff_id(id, first_name)
      `)
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Verify ownership
    if (job.customer_id !== customer.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Only show completed/closed jobs in customer portal
    if (!['completed', 'closed'].includes(job.status)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch approved addons and photos in parallel
    const [addonsResult, photosResult] = await Promise.all([
      admin
        .from('job_addons')
        .select('id, service_id, custom_description, price, status, services:service_id(name)')
        .eq('job_id', jobId)
        .eq('status', 'approved'),
      admin
        .from('job_photos')
        .select('id, zone, phase, image_url, thumbnail_url')
        .eq('job_id', jobId)
        .eq('is_internal', false)
        .neq('phase', 'progress')
        .order('zone')
        .order('sort_order', { ascending: true }),
    ]);

    const vehicle = job.vehicles as unknown as {
      id: string; year: number; make: string; model: string; color: string | null;
    } | null;

    const staff = job.employees as unknown as {
      id: string; first_name: string;
    } | null;

    // Format addons
    const addons = (addonsResult.data || []).map((a) => {
      const svc = a.services as unknown as { name: string } | null;
      return {
        name: svc?.name || a.custom_description || 'Additional service',
        status: a.status,
      };
    });

    // Group photos by phase
    const photos = {
      intake: (photosResult.data || [])
        .filter((p) => p.phase === 'intake')
        .map((p) => ({
          id: p.id,
          zone: p.zone,
          zone_label: getZoneLabel(p.zone),
          thumbnail_url: p.thumbnail_url,
          image_url: p.image_url,
        })),
      completion: (photosResult.data || [])
        .filter((p) => p.phase === 'completion')
        .map((p) => ({
          id: p.id,
          zone: p.zone,
          zone_label: getZoneLabel(p.zone),
          thumbnail_url: p.thumbnail_url,
          image_url: p.image_url,
        })),
    };

    return NextResponse.json({
      job: {
        id: job.id,
        date: job.created_at,
        status: job.status,
        timer_seconds: job.timer_seconds,
        vehicle: vehicle ? {
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          color: vehicle.color,
        } : null,
        services: (job.services as Array<{ name: string; price: number }>) || [],
        addons,
        staff: staff ? { first_name: staff.first_name } : null,
        gallery_token: job.gallery_token,
        photo_count: (photosResult.data || []).length,
        photos,
        picked_up_at: job.actual_pickup_at,
      },
    });
  } catch (err) {
    console.error('[account/services/[jobId]] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
