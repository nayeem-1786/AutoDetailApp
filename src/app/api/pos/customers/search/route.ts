import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone || phone.replace(/\D/g, '').length < 4) {
      return NextResponse.json(
        { error: 'Provide at least 4 digits to search' },
        { status: 400 }
      );
    }

    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const digits = phone.replace(/\D/g, '');

    // Search by phone — partial match on last digits
    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone, email, loyalty_points_balance, visit_count, tags, customer_type')
      .like('phone', `%${digits}`)
      .order('last_name')
      .limit(10);

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
