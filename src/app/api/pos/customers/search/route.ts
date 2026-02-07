import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

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

    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const term = q.trim();
    const digits = term.replace(/\D/g, '');
    const isPhoneSearch = digits.length >= 2 && digits.length === term.replace(/[\s()-]/g, '').length;

    let query = supabase
      .from('customers')
      .select('id, first_name, last_name, phone, email, loyalty_points_balance, visit_count, tags, customer_type')
      .order('last_name')
      .limit(10);

    if (isPhoneSearch) {
      // Phone search — partial match anywhere in the number
      query = query.like('phone', `%${digits}%`);
    } else {
      // Name search — match first or last name (case-insensitive)
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%`
      );
    }

    const { data: customers, error } = await query;

    if (error) {
      console.error('Customer search error:', error);
      return NextResponse.json(
        { error: 'Failed to search customers' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: customers ?? [] });
  } catch (err) {
    console.error('Customer search route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
