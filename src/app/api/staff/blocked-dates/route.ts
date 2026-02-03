import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { blockedDateSchema } from '@/lib/utils/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employee_id');
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');

    const supabase = createAdminClient();

    let query = supabase
      .from('blocked_dates')
      .select('*, employee:employees!blocked_dates_employee_id_fkey(id, first_name, last_name)')
      .order('date', { ascending: true });

    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }
    if (fromDate) {
      query = query.gte('date', fromDate);
    }
    if (toDate) {
      query = query.lte('date', toDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching blocked dates:', error);
      return NextResponse.json(
        { error: 'Failed to fetch blocked dates' },
        { status: 500 }
      );
    }

    return NextResponse.json({ blocked_dates: data ?? [] });
  } catch (err) {
    console.error('Blocked dates GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const parsed = blockedDateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { employee_id, date, reason } = parsed.data;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('blocked_dates')
      .insert({
        employee_id: employee_id ?? null,
        date,
        reason: reason ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating blocked date:', error);
      return NextResponse.json(
        { error: 'Failed to create blocked date' },
        { status: 500 }
      );
    }

    return NextResponse.json({ blocked_date: data }, { status: 201 });
  } catch (err) {
    console.error('Blocked dates POST error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
