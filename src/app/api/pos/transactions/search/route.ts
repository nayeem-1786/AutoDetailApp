import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q')?.trim() || '';
    const dateFrom = searchParams.get('date_from') || '';
    const dateTo = searchParams.get('date_to') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

    let query = supabase
      .from('transactions')
      .select(
        '*, customer:customers(id, first_name, last_name, phone), employee:employees(id, first_name, last_name)',
        { count: 'exact' }
      );

    // Search by receipt number or customer phone
    if (q) {
      const isNumericOnly = /^\d+$/.test(q);

      if (isNumericOnly) {
        // Receipt number search
        query = query.eq('receipt_number', q);
      } else {
        // Phone search - find customers matching the phone, then filter transactions
        const digits = q.replace(/\D/g, '');
        if (digits.length > 0) {
          const { data: matchingCustomers } = await supabase
            .from('customers')
            .select('id')
            .like('phone', `%${digits}%`)
            .limit(100);

          const customerIds = (matchingCustomers ?? []).map((c) => c.id);

          if (customerIds.length === 0) {
            // No matching customers, return empty results
            return NextResponse.json({
              data: [],
              count: 0,
              limit,
              offset,
            });
          }

          query = query.in('customer_id', customerIds);
        }
      }
    }

    // Date filters (expects full ISO strings with timezone, e.g. from the frontend)
    if (dateFrom) {
      query = query.gte('transaction_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('transaction_date', dateTo);
    }

    // Order and paginate
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: transactions, error, count } = await query;

    if (error) {
      console.error('Transaction search error:', error);
      return NextResponse.json(
        { error: 'Failed to search transactions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: transactions ?? [],
      count: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('Transaction search route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
