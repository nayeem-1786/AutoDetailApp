import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { waitlistEntrySchema } from '@/lib/utils/validation';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';

/**
 * GET /api/waitlist — Admin: list waitlist entries with optional filters.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const serviceId = searchParams.get('service_id');
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
    const offset = (page - 1) * limit;

    const supabase = createAdminClient();

    let query = supabase
      .from('waitlist_entries')
      .select(
        '*, customer:customers!customer_id(first_name, last_name, phone), service:services!service_id(name)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }
    if (serviceId) {
      query = query.eq('service_id', serviceId);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('Waitlist GET error:', error.message);
      return NextResponse.json(
        { error: 'Failed to fetch waitlist entries' },
        { status: 500 }
      );
    }

    return NextResponse.json({ entries: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error('Waitlist GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/waitlist — Public: join the waitlist.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = waitlistEntrySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check that waitlist feature flag is enabled
    const waitlistEnabled = await isFeatureEnabled(FEATURE_FLAGS.WAITLIST);

    if (!waitlistEnabled) {
      return NextResponse.json(
        { error: 'Waitlist is not currently available' },
        { status: 400 }
      );
    }

    const { data: entry, error } = await supabase
      .from('waitlist_entries')
      .insert({
        customer_id: parsed.data.customer_id,
        service_id: parsed.data.service_id,
        preferred_date: parsed.data.preferred_date ?? null,
        preferred_time_start: parsed.data.preferred_time_start ?? null,
        preferred_time_end: parsed.data.preferred_time_end ?? null,
        notes: parsed.data.notes ?? null,
        status: 'waiting',
      })
      .select('*')
      .single();

    if (error) {
      console.error('Waitlist insert error:', error.message);
      return NextResponse.json(
        { error: 'Failed to join waitlist' },
        { status: 500 }
      );
    }

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    console.error('Waitlist POST error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
