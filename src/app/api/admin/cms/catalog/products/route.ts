import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/catalog/products — List products with CMS fields
// PATCH /api/admin/cms/catalog/products — Batch update visibility/featured/order
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('products')
    .select('id, name, is_active, show_on_website, is_featured, website_sort_order, category_id, product_categories(name)')
    .order('website_sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.catalog_display.manage');
  if (denied) return denied;

  const body = await request.json();
  const { updates } = body as {
    updates: Array<{
      id: string;
      show_on_website?: boolean;
      is_featured?: boolean;
      website_sort_order?: number;
    }>;
  };

  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  const admin = createAdminClient();
  const errors: string[] = [];

  for (const item of updates) {
    const fields: Record<string, unknown> = {};
    if ('show_on_website' in item) fields.show_on_website = item.show_on_website;
    if ('is_featured' in item) fields.is_featured = item.is_featured;
    if ('website_sort_order' in item) fields.website_sort_order = item.website_sort_order;

    if (Object.keys(fields).length > 0) {
      const { error } = await admin
        .from('products')
        .update(fields)
        .eq('id', item.id);

      if (error) errors.push(`${item.id}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
