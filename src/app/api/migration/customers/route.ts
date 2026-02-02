import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface CustomerPayload {
  square_reference_id: string | null;
  square_customer_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  tags: string[];
  sms_consent: boolean;
  email_consent: boolean;
  visit_count: number;
  lifetime_spend: number;
  first_visit_date: string | null;
  last_visit_date: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customers } = body as { customers: CustomerPayload[] };

    if (!customers || !Array.isArray(customers)) {
      return NextResponse.json(
        { error: 'Invalid request: customers array required' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    let imported = 0;
    const errors: string[] = [];

    // Insert in smaller sub-batches for Supabase
    const SUB_BATCH = 50;

    for (let i = 0; i < customers.length; i += SUB_BATCH) {
      const batch = customers.slice(i, i + SUB_BATCH);

      const rows = batch.map((c) => ({
        square_reference_id: c.square_reference_id || null,
        square_customer_id: c.square_customer_id || null,
        first_name: c.first_name || '',
        last_name: c.last_name || '',
        phone: c.phone || null,
        email: c.email || null,
        birthday: c.birthday || null,
        address_line_1: c.address_line_1 || null,
        address_line_2: c.address_line_2 || null,
        city: c.city || null,
        state: c.state || null,
        zip: c.zip || null,
        notes: c.notes || null,
        tags: c.tags || [],
        sms_consent: c.sms_consent ?? false,
        email_consent: c.email_consent ?? false,
        visit_count: c.visit_count || 0,
        lifetime_spend: c.lifetime_spend || 0,
        first_visit_date: c.first_visit_date || null,
        last_visit_date: c.last_visit_date || null,
        loyalty_points_balance: 0,
      }));

      const { data, error } = await adminClient
        .from('customers')
        .upsert(rows, {
          onConflict: 'phone',
          ignoreDuplicates: true,
        })
        .select('id');

      if (error) {
        console.error('Customer batch insert error:', error);
        errors.push(`Batch at offset ${i}: ${error.message}`);
        // Try individual inserts for failed batch
        for (const row of rows) {
          const { error: singleError } = await adminClient
            .from('customers')
            .insert(row);
          if (!singleError) {
            imported++;
          }
        }
      } else {
        imported += data?.length || batch.length;
      }
    }

    return NextResponse.json({
      imported,
      total: customers.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Customer migration route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
