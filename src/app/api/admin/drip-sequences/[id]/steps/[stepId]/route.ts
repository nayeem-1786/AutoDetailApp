import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

type Params = { params: Promise<{ id: string; stepId: string }> };

const VALID_CHANNELS = ['email', 'sms', 'both'] as const;
const VALID_EXIT_ACTIONS = ['stop', 'move', 'tag'] as const;

// PATCH /api/admin/drip-sequences/[id]/steps/[stepId] — Update a step
export async function PATCH(
  request: NextRequest,
  { params }: Params
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, stepId } = await params;
    const admin = createAdminClient();

    // Verify step belongs to this sequence
    const { data: existingStep, error: fetchError } = await admin
      .from('drip_steps')
      .select('*')
      .eq('id', stepId)
      .eq('sequence_id', id)
      .single();

    if (fetchError || !existingStep) {
      return NextResponse.json({ error: 'Step not found in this sequence' }, { status: 404 });
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
      is_active,
    } = body;

    // Validate channel if provided
    const resolvedChannel = channel !== undefined ? channel : existingStep.channel;
    if (channel !== undefined && !(VALID_CHANNELS as readonly string[]).includes(channel)) {
      return NextResponse.json(
        { error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate delay_days if provided
    if (delay_days !== undefined && (typeof delay_days !== 'number' || delay_days < 0)) {
      return NextResponse.json(
        { error: 'delay_days must be >= 0' },
        { status: 400 }
      );
    }

    // Resolve template_id and sms_template for channel validation
    const resolvedTemplateId = template_id !== undefined ? template_id : existingStep.template_id;
    const resolvedSmsTemplate = sms_template !== undefined ? sms_template : existingStep.sms_template;

    // If channel includes email, template_id must be present
    if ((resolvedChannel === 'email' || resolvedChannel === 'both') && !resolvedTemplateId) {
      return NextResponse.json(
        { error: 'template_id is required when channel includes email' },
        { status: 400 }
      );
    }

    // If channel includes sms, sms_template must be present
    if ((resolvedChannel === 'sms' || resolvedChannel === 'both') && !resolvedSmsTemplate) {
      return NextResponse.json(
        { error: 'sms_template is required when channel includes sms' },
        { status: 400 }
      );
    }

    // Validate exit_action constraints
    const resolvedExitAction = exit_action !== undefined ? exit_action : existingStep.exit_action;
    if (resolvedExitAction) {
      if (!(VALID_EXIT_ACTIONS as readonly string[]).includes(resolvedExitAction)) {
        return NextResponse.json(
          { error: `exit_action must be one of: ${VALID_EXIT_ACTIONS.join(', ')}` },
          { status: 400 }
        );
      }

      const resolvedExitSequenceId = exit_sequence_id !== undefined ? exit_sequence_id : existingStep.exit_sequence_id;
      const resolvedExitTag = exit_tag !== undefined ? exit_tag : existingStep.exit_tag;

      if (resolvedExitAction === 'move' && !resolvedExitSequenceId) {
        return NextResponse.json(
          { error: 'exit_sequence_id is required when exit_action is "move"' },
          { status: 400 }
        );
      }

      if (resolvedExitAction === 'tag' && !resolvedExitTag) {
        return NextResponse.json(
          { error: 'exit_tag is required when exit_action is "tag"' },
          { status: 400 }
        );
      }
    }

    // Build update payload with only provided fields
    const updatePayload: Record<string, unknown> = {};
    if (delay_days !== undefined) updatePayload.delay_days = delay_days;
    if (delay_hours !== undefined) updatePayload.delay_hours = delay_hours;
    if (channel !== undefined) updatePayload.channel = channel;
    if (template_id !== undefined) updatePayload.template_id = template_id || null;
    if (sms_template !== undefined) updatePayload.sms_template = sms_template || null;
    if (coupon_id !== undefined) updatePayload.coupon_id = coupon_id || null;
    if (subject_override !== undefined) updatePayload.subject_override = subject_override || null;
    if (exit_condition !== undefined) updatePayload.exit_condition = exit_condition || null;
    if (exit_action !== undefined) updatePayload.exit_action = exit_action || null;
    if (exit_sequence_id !== undefined) updatePayload.exit_sequence_id = exit_sequence_id || null;
    if (exit_tag !== undefined) updatePayload.exit_tag = exit_tag || null;
    if (is_active !== undefined) updatePayload.is_active = is_active;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: updatedStep, error: updateError } = await admin
      .from('drip_steps')
      .update(updatePayload)
      .eq('id', stepId)
      .eq('sequence_id', id)
      .select('*, email_templates(id, name, subject), coupons(id, code, name)')
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ data: updatedStep });
  } catch (err) {
    console.error('[admin/drip-sequences/[id]/steps/[stepId]] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/drip-sequences/[id]/steps/[stepId] — Delete a step and renumber
export async function DELETE(
  _request: NextRequest,
  { params }: Params
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, stepId } = await params;
    const admin = createAdminClient();

    // Verify step belongs to this sequence
    const { data: existingStep, error: fetchError } = await admin
      .from('drip_steps')
      .select('id')
      .eq('id', stepId)
      .eq('sequence_id', id)
      .single();

    if (fetchError || !existingStep) {
      return NextResponse.json({ error: 'Step not found in this sequence' }, { status: 404 });
    }

    // Delete the step
    const { error: deleteError } = await admin
      .from('drip_steps')
      .delete()
      .eq('id', stepId);

    if (deleteError) throw deleteError;

    // Renumber remaining steps sequentially (0, 1, 2, ...)
    const { data: remainingSteps, error: fetchRemaining } = await admin
      .from('drip_steps')
      .select('id')
      .eq('sequence_id', id)
      .order('step_order', { ascending: true });

    if (!fetchRemaining && remainingSteps && remainingSteps.length > 0) {
      for (let i = 0; i < remainingSteps.length; i++) {
        const { error: renumberError } = await admin
          .from('drip_steps')
          .update({ step_order: i })
          .eq('id', remainingSteps[i].id);

        if (renumberError) {
          console.error(`[admin/drip-sequences/[id]/steps/[stepId]] Renumber error (${remainingSteps[i].id}):`, renumberError);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/drip-sequences/[id]/steps/[stepId]] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
