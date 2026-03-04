import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

const VALID_TRIGGERS = ['no_visit_days', 'after_service', 'new_customer', 'manual_enroll', 'tag_added'] as const;

// GET /api/admin/drip-sequences — List all sequences with enrollment counts
export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const admin = createAdminClient();

    let query = admin
      .from('drip_sequences')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data: sequences, error, count } = await query;
    if (error) throw error;

    // Get active enrollment counts grouped by sequence_id
    // Supabase client doesn't support GROUP BY, so fetch sequence_ids and count in JS
    const { data: enrollments } = await admin
      .from('drip_enrollments')
      .select('sequence_id')
      .eq('status', 'active');

    const countMap: Record<string, number> = {};
    if (enrollments) {
      for (const row of enrollments) {
        countMap[row.sequence_id] = (countMap[row.sequence_id] || 0) + 1;
      }
    }

    const data = (sequences || []).map((seq) => ({
      ...seq,
      active_enrollments: countMap[seq.id] || 0,
    }));

    return NextResponse.json({ data, total: count ?? 0 }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    console.error('[admin/drip-sequences] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/drip-sequences — Create a new sequence with optional steps
export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      description,
      trigger_condition,
      trigger_value,
      stop_conditions,
      nurture_sequence_id,
      is_active,
      audience_filters,
      steps,
    } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!trigger_condition || !VALID_TRIGGERS.includes(trigger_condition)) {
      return NextResponse.json(
        { error: `trigger_condition must be one of: ${VALID_TRIGGERS.join(', ')}` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const insertPayload = {
      name: name.trim(),
      description: description || null,
      trigger_condition,
      trigger_value: trigger_value || null,
      stop_conditions: stop_conditions || { on_purchase: true, on_booking: true, on_reply: false },
      nurture_sequence_id: nurture_sequence_id || null,
      is_active: is_active ?? false,
      audience_filters: audience_filters || null,
      created_by: employee.auth_user_id,
    };

    const { data: sequence, error } = await admin
      .from('drip_sequences')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) throw error;

    // Insert steps if provided
    if (steps && Array.isArray(steps) && steps.length > 0) {
      const stepInserts = steps.map((step: Record<string, unknown>, index: number) => ({
        sequence_id: sequence.id,
        step_order: index,
        delay_days: step.delay_days ?? 0,
        delay_hours: step.delay_hours ?? 0,
        channel: step.channel || 'email',
        template_id: step.template_id || null,
        sms_template: step.sms_template || null,
        coupon_id: step.coupon_id || null,
        subject_override: step.subject_override || null,
        exit_condition: step.exit_condition || null,
        exit_action: step.exit_action || null,
        exit_sequence_id: step.exit_sequence_id || null,
        exit_tag: step.exit_tag || null,
        is_active: step.is_active ?? true,
      }));

      const { error: stepsError } = await admin
        .from('drip_steps')
        .insert(stepInserts);

      if (stepsError) {
        console.error('[admin/drip-sequences] Steps insert error:', stepsError);
        // Sequence was created successfully, but steps failed — don't fail the whole request
        // The client can retry adding steps via the steps endpoint
      }
    }

    // Re-fetch with steps included
    const { data: fullSequence } = await admin
      .from('drip_sequences')
      .select('*')
      .eq('id', sequence.id)
      .single();

    const { data: insertedSteps } = await admin
      .from('drip_steps')
      .select('*, email_templates(id, name, subject), coupons(id, code, name)')
      .eq('sequence_id', sequence.id)
      .order('step_order', { ascending: true });

    return NextResponse.json(
      { data: { ...(fullSequence || sequence), steps: insertedSteps || [] } },
      { status: 201 }
    );
  } catch (err) {
    console.error('[admin/drip-sequences] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
