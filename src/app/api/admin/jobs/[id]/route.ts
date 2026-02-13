import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const denied = await requirePermission(employee.id, 'admin.photos.view');
  if (denied) return denied;

  const { id } = await params;
  const admin = createAdminClient();

  // Fetch job with all relations
  const { data: job, error } = await admin
    .from('jobs')
    .select(
      `
      *,
      customer:customers(id, first_name, last_name, phone, email),
      vehicle:vehicles(id, year, make, model, color, size_class),
      assigned_staff:employees!jobs_assigned_staff_id_fkey(id, first_name, last_name)
    `
    )
    .eq('id', id)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Fetch addons with resolved service/product names
  const { data: addons } = await admin
    .from('job_addons')
    .select('*')
    .eq('job_id', id)
    .order('created_at', { ascending: false });

  // Resolve service/product names for addons
  const enrichedAddons = await Promise.all(
    (addons || []).map(async (addon) => {
      let service_name: string | null = null;
      let product_name: string | null = null;

      if (addon.service_id) {
        const { data: svc } = await admin
          .from('services')
          .select('name')
          .eq('id', addon.service_id)
          .single();
        service_name = svc?.name || null;
      }
      if (addon.product_id) {
        const { data: prod } = await admin
          .from('products')
          .select('name')
          .eq('id', addon.product_id)
          .single();
        product_name = prod?.name || null;
      }

      return {
        ...addon,
        service_name,
        product_name,
      };
    })
  );

  // Fetch photos grouped by phase
  const { data: photos } = await admin
    .from('job_photos')
    .select('*')
    .eq('job_id', id)
    .order('phase', { ascending: true })
    .order('sort_order', { ascending: true });

  // Group photos by phase
  const photosByPhase: Record<string, typeof photos> = {
    intake: [],
    progress: [],
    completion: [],
  };
  for (const photo of photos || []) {
    if (photosByPhase[photo.phase]) {
      photosByPhase[photo.phase]!.push(photo);
    }
  }

  // Fetch employee who took photos (created_by)
  const creatorIds = [
    ...new Set((photos || []).map((p) => p.created_by).filter(Boolean)),
  ];
  let photoCreators: Record<string, string> = {};
  if (creatorIds.length > 0) {
    const { data: creators } = await admin
      .from('employees')
      .select('id, first_name, last_name')
      .in('id', creatorIds as string[]);
    if (creators) {
      for (const c of creators) {
        photoCreators[c.id] = `${c.first_name} ${c.last_name || ''}`.trim();
      }
    }
  }

  // Fetch transaction info if linked
  let transaction = null;
  if (job.transaction_id) {
    const { data: txn } = await admin
      .from('transactions')
      .select('id, total, payment_method, transaction_date')
      .eq('id', job.transaction_id)
      .single();
    transaction = txn;
  }

  return NextResponse.json({
    job: {
      ...job,
      addons: enrichedAddons,
      photos_by_phase: photosByPhase,
      photo_creators: photoCreators,
      transaction,
    },
  });
}
