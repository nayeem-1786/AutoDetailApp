import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enrollCustomer } from '@/lib/email/drip-engine';

type Params = { params: Promise<{ id: string }> };

// ─── GET: List enrollments for a drip sequence ──────────────────────

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const admin = createAdminClient();

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    // Verify sequence exists
    const { data: sequence, error: seqError } = await admin
      .from('drip_sequences')
      .select('id')
      .eq('id', id)
      .single();

    if (seqError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Build enrollment query
    let query = admin
      .from('drip_enrollments')
      .select('*')
      .eq('sequence_id', id)
      .order('enrolled_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && ['active', 'completed', 'stopped', 'paused'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data: enrollments, error: enrollError } = await query;

    if (enrollError) {
      console.error('[Drip API] Failed to fetch enrollments:', enrollError);
      return NextResponse.json({ error: 'Failed to fetch enrollments' }, { status: 500 });
    }

    // Get total count (with same filters)
    let countQuery = admin
      .from('drip_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('sequence_id', id);

    if (status && ['active', 'completed', 'stopped', 'paused'].includes(status)) {
      countQuery = countQuery.eq('status', status);
    }

    const { count: total } = await countQuery;

    // Batch-fetch customer data (can't join due to Supabase FK issues)
    const customerIds = [...new Set((enrollments || []).map((e) => e.customer_id))];
    let customerMap: Record<string, { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }> = {};

    if (customerIds.length > 0) {
      const { data: customers } = await admin
        .from('customers')
        .select('id, first_name, last_name, email, phone')
        .in('id', customerIds);

      if (customers) {
        for (const c of customers) {
          customerMap[c.id] = c;
        }
      }
    }

    // Merge customer data into enrollment records
    const enriched = (enrollments || []).map((enrollment) => ({
      ...enrollment,
      customer: customerMap[enrollment.customer_id] || null,
    }));

    return NextResponse.json({
      data: enriched,
      total: total ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('[Drip API] Enrollments GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST: Manual enrollment ────────────────────────────────────────

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const admin = createAdminClient();

    const body = await request.json();
    const { customer_id } = body;

    if (!customer_id || typeof customer_id !== 'string') {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    // Verify customer exists
    const { data: customer, error: custError } = await admin
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .single();

    if (custError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Enroll via drip engine (handles sequence active check, duplicate check, first step delay)
    const enrollment = await enrollCustomer(id, customer_id, admin);

    if (!enrollment) {
      return NextResponse.json(
        { error: 'Customer is already enrolled in this sequence or sequence is inactive' },
        { status: 409 }
      );
    }

    // Fetch the full enrollment record to return
    const { data: fullEnrollment } = await admin
      .from('drip_enrollments')
      .select('*')
      .eq('id', enrollment.id)
      .single();

    return NextResponse.json({ data: fullEnrollment }, { status: 201 });
  } catch (err) {
    console.error('[Drip API] Enrollment POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
