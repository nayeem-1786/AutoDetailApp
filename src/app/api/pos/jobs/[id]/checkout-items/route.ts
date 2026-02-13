import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

/**
 * GET /api/pos/jobs/[id]/checkout-items
 * Returns line items for POS ticket from:
 *   1. Job services (JSONB snapshot)
 *   2. Approved job addons
 *   3. Products from linked quote (via quote_id bridge)
 *   4. Coupon code from linked quote
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
        id, status, services, customer_id, vehicle_id, quote_id,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone, email, customer_type, tags),
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

    // Prevent double checkout
    if (job.status === 'closed') {
      return NextResponse.json(
        { error: 'Job already checked out and closed' },
        { status: 400 }
      );
    }

    // Lookup service/product metadata for is_taxable and category_id
    const serviceIds = ((job.services || []) as Array<{ id: string }>).map((s) => s.id);
    const serviceMetaMap = new Map<string, { is_taxable: boolean; category_id: string | null }>();
    if (serviceIds.length > 0) {
      const { data: serviceMeta } = await supabase
        .from('services')
        .select('id, is_taxable, category_id')
        .in('id', serviceIds);
      if (serviceMeta) {
        for (const s of serviceMeta) {
          serviceMetaMap.set(s.id, { is_taxable: s.is_taxable, category_id: s.category_id });
        }
      }
    }

    // Build ticket items from services JSONB
    const services = (job.services as Array<{
      id: string;
      name: string;
      price: number;
      quantity?: number;
      tier_name?: string;
    }>) || [];

    const items: Array<{
      item_type: 'service' | 'product' | 'custom';
      service_id?: string;
      product_id?: string;
      item_name: string;
      quantity: number;
      unit_price: number;
      is_addon?: boolean;
      discount_amount?: number;
      tier_name?: string;
      is_taxable: boolean;
      category_id?: string;
    }> = [];

    for (const svc of services) {
      const meta = serviceMetaMap.get(svc.id);
      items.push({
        item_type: 'service',
        service_id: svc.id,
        item_name: svc.name,
        quantity: svc.quantity ?? 1,
        unit_price: svc.quantity && svc.quantity > 1
          ? Math.round((svc.price / svc.quantity) * 100) / 100
          : svc.price,
        tier_name: svc.tier_name,
        is_taxable: meta?.is_taxable ?? false,
        category_id: meta?.category_id || undefined,
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

    // Collect addon service/product IDs for metadata lookup
    const addonServiceIds = approvedAddons.filter((a) => a.service_id).map((a) => a.service_id!);
    const addonProductIds = approvedAddons.filter((a) => a.product_id).map((a) => a.product_id!);

    const addonServiceMetaMap = new Map<string, { is_taxable: boolean; category_id: string | null }>();
    if (addonServiceIds.length > 0) {
      const { data: meta } = await supabase.from('services').select('id, is_taxable, category_id').in('id', addonServiceIds);
      if (meta) for (const s of meta) addonServiceMetaMap.set(s.id, { is_taxable: s.is_taxable, category_id: s.category_id });
    }

    const addonProductMetaMap = new Map<string, { is_taxable: boolean; category_id: string | null }>();
    if (addonProductIds.length > 0) {
      const { data: meta } = await supabase.from('products').select('id, is_taxable, category_id').in('id', addonProductIds);
      if (meta) for (const s of meta) addonProductMetaMap.set(s.id, { is_taxable: s.is_taxable, category_id: s.category_id });
    }

    for (const addon of approvedAddons) {
      const finalPrice = Number(addon.price) - Number(addon.discount_amount);
      const addonMeta = addon.service_id
        ? addonServiceMetaMap.get(addon.service_id)
        : addon.product_id
          ? addonProductMetaMap.get(addon.product_id)
          : null;
      items.push({
        item_type: addon.service_id ? 'service' : addon.product_id ? 'product' : 'custom',
        service_id: addon.service_id || undefined,
        product_id: addon.product_id || undefined,
        item_name: addon.custom_description || 'Add-on Service',
        quantity: 1,
        unit_price: finalPrice,
        is_addon: true,
        discount_amount: Number(addon.discount_amount) > 0 ? Number(addon.discount_amount) : undefined,
        is_taxable: addonMeta?.is_taxable ?? false,
        category_id: addonMeta?.category_id || undefined,
      });
    }

    // Bridge: load products + coupon from linked quote (if quote_id exists)
    let coupon_code: string | null = null;

    if (job.quote_id) {
      // Fetch quote for coupon code
      const { data: quote } = await supabase
        .from('quotes')
        .select('coupon_code')
        .eq('id', job.quote_id)
        .single();

      if (quote?.coupon_code) {
        coupon_code = quote.coupon_code;
      }

      // Fetch product items from quote
      const { data: quoteProducts } = await supabase
        .from('quote_items')
        .select('id, product_id, item_name, quantity, unit_price, total_price, tier_name, notes')
        .eq('quote_id', job.quote_id)
        .not('product_id', 'is', null);

      if (quoteProducts && quoteProducts.length > 0) {
        // Lookup product metadata
        const qpIds = quoteProducts.map((p) => p.product_id!);
        const qpMetaMap = new Map<string, { is_taxable: boolean; category_id: string | null }>();
        if (qpIds.length > 0) {
          const { data: meta } = await supabase.from('products').select('id, is_taxable, category_id').in('id', qpIds);
          if (meta) for (const p of meta) qpMetaMap.set(p.id, { is_taxable: p.is_taxable, category_id: p.category_id });
        }

        for (const prod of quoteProducts) {
          const pMeta = qpMetaMap.get(prod.product_id!);
          items.push({
            item_type: 'product',
            product_id: prod.product_id!,
            item_name: prod.item_name,
            quantity: prod.quantity,
            unit_price: prod.unit_price,
            is_taxable: pMeta?.is_taxable ?? true,
            category_id: pMeta?.category_id || undefined,
          });
        }
      }
    }

    return NextResponse.json({
      data: {
        job_id: job.id,
        customer_id: job.customer_id,
        vehicle_id: job.vehicle_id,
        customer: job.customer,
        vehicle: job.vehicle,
        items,
        coupon_code,
        status: job.status,
      },
    });
  } catch (err) {
    console.error('Checkout items route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
