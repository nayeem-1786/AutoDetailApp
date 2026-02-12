import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/authorize/[token] — Get addon details for authorization page
 * Public endpoint — no auth required, token-scoped access.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createAdminClient();

    const { data: addon, error } = await supabase
      .from('job_addons')
      .select(`
        *,
        job:jobs!job_addons_job_id_fkey(
          id, services, estimated_pickup_at,
          customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone),
          vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color)
        )
      `)
      .eq('authorization_token', token)
      .single();

    if (error || !addon) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Get photos if any
    let photos: { id: string; image_url: string; annotation_data: unknown }[] = [];
    if (addon.photo_ids?.length > 0) {
      const { data: photoData } = await supabase
        .from('job_photos')
        .select('id, image_url, annotation_data')
        .in('id', addon.photo_ids);
      photos = photoData ?? [];
    }

    // Get service/product name if from catalog
    let catalogItemName: string | null = null;
    if (addon.service_id) {
      const { data: svc } = await supabase
        .from('services')
        .select('name')
        .eq('id', addon.service_id)
        .single();
      catalogItemName = svc?.name ?? null;
    } else if (addon.product_id) {
      const { data: prod } = await supabase
        .from('products')
        .select('name')
        .eq('id', addon.product_id)
        .single();
      catalogItemName = prod?.name ?? null;
    }

    return NextResponse.json({
      data: {
        ...addon,
        photos,
        catalog_item_name: catalogItemName,
      },
    });
  } catch (err) {
    console.error('Authorization GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
