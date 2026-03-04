import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

type Params = { params: Promise<{ id: string }> };

const VALID_TRIGGERS = ['no_visit_days', 'after_service', 'new_customer', 'manual_enroll', 'tag_added'] as const;

// GET /api/admin/drip-sequences/[id] — Single sequence with steps
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

    const { data: sequence, error } = await admin
      .from('drip_sequences')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    const { data: steps, error: stepsError } = await admin
      .from('drip_steps')
      .select('*, email_templates(id, name, subject), coupons(id, code, name)')
      .eq('sequence_id', id)
      .order('step_order', { ascending: true });

    if (stepsError) {
      console.error('[admin/drip-sequences/[id]] Steps fetch error:', stepsError);
    }

    return NextResponse.json(
      { data: { ...sequence, steps: steps || [] } },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err) {
    console.error('[admin/drip-sequences/[id]] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/drip-sequences/[id] — Update sequence fields and optionally reconcile steps
export async function PATCH(
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
    const { data: existing, error: fetchError } = await admin
      .from('drip_sequences')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
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

    // Validate trigger_condition if provided
    if (trigger_condition !== undefined && !VALID_TRIGGERS.includes(trigger_condition)) {
      return NextResponse.json(
        { error: `trigger_condition must be one of: ${VALID_TRIGGERS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate name if provided
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }

    // Build update payload with only provided fields
    const updatePayload: Record<string, unknown> = {};
    if (name !== undefined) updatePayload.name = name.trim();
    if (description !== undefined) updatePayload.description = description || null;
    if (trigger_condition !== undefined) updatePayload.trigger_condition = trigger_condition;
    if (trigger_value !== undefined) updatePayload.trigger_value = trigger_value;
    if (stop_conditions !== undefined) updatePayload.stop_conditions = stop_conditions;
    if (nurture_sequence_id !== undefined) updatePayload.nurture_sequence_id = nurture_sequence_id || null;
    if (is_active !== undefined) updatePayload.is_active = is_active;
    if (audience_filters !== undefined) updatePayload.audience_filters = audience_filters || null;

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await admin
        .from('drip_sequences')
        .update(updatePayload)
        .eq('id', id);

      if (updateError) throw updateError;
    }

    // Reconcile steps if provided
    if (steps !== undefined && Array.isArray(steps)) {
      // Get existing steps
      const { data: existingSteps } = await admin
        .from('drip_steps')
        .select('id')
        .eq('sequence_id', id);

      const existingStepIds = new Set((existingSteps || []).map((s) => s.id));
      const incomingStepIds = new Set(
        steps.filter((s: Record<string, unknown>) => s.id).map((s: Record<string, unknown>) => s.id as string)
      );

      // Delete removed steps (exist in DB but not in incoming array)
      const toDelete = [...existingStepIds].filter((sid) => !incomingStepIds.has(sid));
      if (toDelete.length > 0) {
        const { error: deleteError } = await admin
          .from('drip_steps')
          .delete()
          .in('id', toDelete);

        if (deleteError) {
          console.error('[admin/drip-sequences/[id]] Steps delete error:', deleteError);
        }
      }

      // Update existing and insert new steps
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i] as Record<string, unknown>;
        const stepData = {
          sequence_id: id,
          step_order: i,
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
        };

        if (step.id && existingStepIds.has(step.id as string)) {
          // Update existing step
          const { error: upErr } = await admin
            .from('drip_steps')
            .update(stepData)
            .eq('id', step.id as string);

          if (upErr) {
            console.error(`[admin/drip-sequences/[id]] Step update error (${step.id}):`, upErr);
          }
        } else {
          // Insert new step
          const { error: insErr } = await admin
            .from('drip_steps')
            .insert(stepData);

          if (insErr) {
            console.error('[admin/drip-sequences/[id]] Step insert error:', insErr);
          }
        }
      }
    }

    // Re-fetch complete sequence with steps
    const { data: updatedSequence } = await admin
      .from('drip_sequences')
      .select('*')
      .eq('id', id)
      .single();

    const { data: updatedSteps } = await admin
      .from('drip_steps')
      .select('*, email_templates(id, name, subject), coupons(id, code, name)')
      .eq('sequence_id', id)
      .order('step_order', { ascending: true });

    return NextResponse.json({
      data: { ...(updatedSequence || existing), steps: updatedSteps || [] },
    });
  } catch (err) {
    console.error('[admin/drip-sequences/[id]] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/drip-sequences/[id] — Delete a sequence (if no active enrollments)
export async function DELETE(
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
    const { data: sequence, error: fetchError } = await admin
      .from('drip_sequences')
      .select('id, name')
      .eq('id', id)
      .single();

    if (fetchError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Check for active enrollments
    const { count, error: countError } = await admin
      .from('drip_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('sequence_id', id)
      .eq('status', 'active');

    if (countError) throw countError;

    if (count && count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete sequence with active enrollments. Cancel all enrollments first.' },
        { status: 400 }
      );
    }

    // Delete — CASCADE handles steps, enrollments, logs
    const { error: deleteError } = await admin
      .from('drip_sequences')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/drip-sequences/[id]] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
