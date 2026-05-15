import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface ProductPayload {
  square_item_id: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  category_slug: string | null;
  vendor_name: string | null;
  cost_price: number;
  retail_price: number;
  quantity_on_hand: number;
  reorder_threshold: number | null;
  is_taxable: boolean;
  is_loyalty_eligible: boolean;
  gtin: string | null;
  is_active: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vendors, products } = body as {
      vendors: string[];
      products: ProductPayload[];
    };

    if (!products || !Array.isArray(products)) {
      return NextResponse.json(
        { error: 'Invalid request: products array required' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Step 1: Create vendors
    let vendorsCreated = 0;
    const vendorMap = new Map<string, string>(); // name -> id

    if (vendors && vendors.length > 0) {
      for (const vendorName of vendors) {
        if (!vendorName) continue;

        // Check if vendor already exists
        const { data: existing } = await adminClient
          .from('vendors')
          .select('id')
          .eq('name', vendorName)
          .maybeSingle();

        if (existing) {
          vendorMap.set(vendorName, existing.id);
        } else {
          const { data: created, error } = await adminClient
            .from('vendors')
            .insert({
              name: vendorName,
              is_active: true,
            })
            .select('id')
            .single();

          if (error) {
            console.error(`Vendor creation error for "${vendorName}":`, error);
          } else if (created) {
            vendorMap.set(vendorName, created.id);
            vendorsCreated++;
          }
        }
      }
    }

    // Step 2: Resolve category IDs from slugs
    const categoryMap = new Map<string, string>(); // slug -> id
    const uniqueSlugs = [...new Set(products.map((p) => p.category_slug).filter(Boolean))];

    if (uniqueSlugs.length > 0) {
      const { data: categories } = await adminClient
        .from('product_categories')
        .select('id, slug')
        .in('slug', uniqueSlugs as string[]);

      categories?.forEach((cat) => {
        categoryMap.set(cat.slug, cat.id);
      });
    }

    // Step 3: Insert products
    let productsImported = 0;
    const errors: string[] = [];

    const SUB_BATCH = 50;

    for (let i = 0; i < products.length; i += SUB_BATCH) {
      const batch = products.slice(i, i + SUB_BATCH);

      const rows = batch.map((p) => ({
        square_item_id: p.square_item_id || null,
        sku: p.sku || null,
        name: p.name,
        description: p.description || null,
        category_id: p.category_slug ? (categoryMap.get(p.category_slug) || null) : null,
        vendor_id: p.vendor_name ? (vendorMap.get(p.vendor_name) || null) : null,
        cost_price: p.cost_price || 0,
        retail_price: p.retail_price || 0,
        quantity_on_hand: p.quantity_on_hand || 0,
        reorder_threshold: p.reorder_threshold || null,
        is_taxable: p.is_taxable ?? true,
        is_loyalty_eligible: p.is_loyalty_eligible ?? true,
        barcode: p.gtin || null,
        is_active: p.is_active ?? true,
      }));

      const { data, error } = await adminClient
        .from('products')
        .insert(rows)
        .select('id');

      if (error) {
        console.error('Product batch insert error:', error);
        errors.push(`Batch at offset ${i}: ${error.message}`);
        // Try individual inserts
        for (const row of rows) {
          const { error: singleError } = await adminClient
            .from('products')
            .insert(row);
          if (!singleError) {
            productsImported++;
          }
        }
      } else {
        productsImported += data?.length || batch.length;
      }
    }

    return NextResponse.json({
      productsImported,
      vendorsCreated,
      vendorsMapped: vendorMap.size,
      categoriesMapped: categoryMap.size,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Product migration route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
