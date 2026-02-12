import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

/**
 * GET /api/pos/jobs/[id]/checkout-items
 * Returns line items for POS ticket from job services + approved addons.
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

    // Fetch job with addons
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        id, status, services, customer_id, vehicle_id,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color, size_class),
        addons:job_addons(
          id, service_id, product_id, custom_description, price,
          discount_amount, status, pickup_delay_minutes
        )
      `)
      .eq('id', id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Build ticket items from services JSONB
    const services = (job.services as Array<{ id: string; name: string; price: number }>) || [];
    const items: Array<{
      item_type: 'service' | 'product' | 'custom';
      service_id?: string;
      product_id?: string;
      item_name: string;
      quantity: number;
      unit_price: number;
      is_addon?: boolean;
      discount_amount?: number;
    }> = [];

    for (const svc of services) {
      items.push({
        item_type: 'service',
        service_id: svc.id,
        item_name: svc.name,
        quantity: 1,
        unit_price: svc.price,
      });
    }

    // Add approved addon items
    const approvedAddons = ((job.addons || []) as Array<{
      id: string;
      service_id: string | null;
      product_id: string | null;
      custom_description: string | null;
      price: number;
      discount_amount: number;
      status: string;
    }>).filter((a) => a.status === 'approved');

    for (const addon of approvedAddons) {
      const finalPrice = Number(addon.price) - Number(addon.discount_amount);
      items.push({
        item_type: addon.service_id ? 'service' : addon.product_id ? 'product' : 'custom',
        service_id: addon.service_id || undefined,
        product_id: addon.product_id || undefined,
        item_name: addon.custom_description || 'Add-on Service',
        quantity: 1,
        unit_price: finalPrice,
        is_addon: true,
        discount_amount: Number(addon.discount_amount) > 0 ? Number(addon.discount_amount) : undefined,
      });
    }

    return NextResponse.json({
      data: {
        job_id: job.id,
        customer_id: job.customer_id,
        vehicle_id: job.vehicle_id,
        customer: job.customer,
        vehicle: job.vehicle,
        items,
        status: job.status,
      },
    });
  } catch (err) {
    console.error('Checkout items route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
