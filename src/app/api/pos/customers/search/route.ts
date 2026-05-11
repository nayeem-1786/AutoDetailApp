import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { searchCustomers } from '@/lib/search/customer-search';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || searchParams.get('phone') || '';

    if (q.trim().length < 2) {
      return NextResponse.json(
        { error: 'Provide at least 2 characters to search' },
        { status: 400 }
      );
    }

    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data: customers, error } = await searchCustomers(supabase, q, {
      // Phase Mobile-1.1: include structured address columns so the mobile
      // address field can pre-fill from the selected customer's profile.
      select:
        'id, first_name, last_name, phone, email, loyalty_points_balance, visit_count, tags, customer_type, address_line_1, address_line_2, city, state, zip',
      limit: 10,
    });

    if (error) {
      console.error('Customer search error:', error);
      return NextResponse.json(
        { error: 'Failed to search customers' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: customers });
  } catch (err) {
    console.error('Customer search route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
