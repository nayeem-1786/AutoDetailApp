import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

type Params = { params: Promise<{ id: string }> };

const VALID_CHANNELS = ['email', 'sms', 'both'] as const;
const VALID_EXIT_ACTIONS = ['stop', 'move', 'tag'] as const;

// GET /api/admin/drip-sequences/[id]/steps — List steps for a sequence
export async function GET(
  _request: NextRequest,
  { params }: Params
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const admin = createAdminClient();

    // Verify sequence exists
    const { data: sequence, error: seqError } = await admin
      .from('drip_sequences')
      .select('id')
      .eq('id', id)
      .single();

    if (seqError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    const { data: steps, error } = await admin
      .from('drip_steps')
      .select('*, email_templates(id, name, subject), coupons(id, code, name)')
      .eq('sequence_id', id)
      .order('step_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json(
      { data: steps || [] },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err) {
    console.error('[admin/drip-sequences/[id]/steps] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/drip-sequences/[id]/steps — Add a step to a sequence
export async function POST(
  request: NextRequest,
  { params }: Params
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const admin = createAdminClient();

    // Verify sequence exists
    const { data: sequence, error: seqError } = await admin
      .from('drip_sequences')
      .select('id')
      .eq('id', id)
      .single();

    if (seqError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      delay_days,
      delay_hours,
      channel,
      template_id,
      sms_template,
      coupon_id,
      subject_override,
      exit_condition,
      exit_action,
      exit_sequence_id,
      exit_tag,
    } = body;

    // Validate channel
    if (!channel || !(VALID_CHANNELS as readonly string[]).includes(channel)) {
      return NextResponse.json(
        { error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate delay_days
    if (delay_days === undefined || delay_days === null || typeof delay_days !== 'number' || delay_days < 0) {
      return NextResponse.json(
        { error: 'delay_days is required and must be >= 0' },
        { status: 400 }
      );
    }

    // If channel includes email, template_id is required
    if ((channel === 'email' || channel === 'both') && !template_id) {
      return NextResponse.json(
        { error: 'template_id is required when channel includes email' },
        { status: 400 }
      );
    }

    // If channel includes sms, sms_template is required
    if ((channel === 'sms' || channel === 'both') && !sms_template) {
      return NextResponse.json(
        { error: 'sms_template is required when channel includes sms' },
        { status: 400 }
      );
    }

    // Validate exit_action constraints
    if (exit_action) {
      if (!(VALID_EXIT_ACTIONS as readonly string[]).includes(exit_action)) {
        return NextResponse.json(
          { error: `exit_action must be one of: ${VALID_EXIT_ACTIONS.join(', ')}` },
          { status: 400 }
        );
      }

      if (exit_action === 'move' && !exit_sequence_id) {
        return NextResponse.json(
          { error: 'exit_sequence_id is required when exit_action is "move"' },
          { status: 400 }
        );
      }

      if (exit_action === 'tag' && !exit_tag) {
        return NextResponse.json(
          { error: 'exit_tag is required when exit_action is "tag"' },
          { status: 400 }
        );
      }
    }

    // Determine step_order: MAX(step_order) + 1, or 0 if no steps exist
    const { data: maxStepRow } = await admin
      .from('drip_steps')
      .select('step_order')
      .eq('sequence_id', id)
      .order('step_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = maxStepRow ? maxStepRow.step_order + 1 : 0;

    const { data: step, error: insertError } = await admin
      .from('drip_steps')
      .insert({
        sequence_id: id,
        step_order: nextOrder,
        delay_days,
        delay_hours: delay_hours ?? 0,
        channel,
        template_id: template_id || null,
        sms_template: sms_template || null,
        coupon_id: coupon_id || null,
        subject_override: subject_override || null,
        exit_condition: exit_condition || null,
        exit_action: exit_action || null,
        exit_sequence_id: exit_sequence_id || null,
        exit_tag: exit_tag || null,
        is_active: true,
      })
      .select('*, email_templates(id, name, subject), coupons(id, code, name)')
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ data: step }, { status: 201 });
  } catch (err) {
    console.error('[admin/drip-sequences/[id]/steps] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
