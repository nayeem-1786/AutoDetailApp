import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Params = { params: Promise<{ id: string; enrollId: string }> };

// ─── PATCH: Update enrollment status ────────────────────────────────

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, enrollId } = await params;
    const admin = createAdminClient();

    const body = await request.json();
    const { action } = body;

    if (!action || !['pause', 'resume', 'cancel', 'skip'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be one of: pause, resume, cancel, skip' },
        { status: 400 }
      );
    }

    // Verify enrollment exists and belongs to this sequence
    const { data: enrollment, error: enrollError } = await admin
      .from('drip_enrollments')
      .select('*')
      .eq('id', enrollId)
      .eq('sequence_id', id)
      .single();

    if (enrollError || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    // ── PAUSE ─────────────────────────────────────────────────────────
    if (action === 'pause') {
      if (enrollment.status !== 'active') {
        return NextResponse.json(
          { error: 'Can only pause active enrollments' },
          { status: 400 }
        );
      }

      const { data: updated, error: updateError } = await admin
        .from('drip_enrollments')
        .update({
          status: 'paused',
          next_send_at: null,
        })
        .eq('id', enrollId)
        .select('*')
        .single();

      if (updateError) {
        console.error('[Drip API] Pause enrollment failed:', updateError);
        return NextResponse.json({ error: 'Failed to pause enrollment' }, { status: 500 });
      }

      return NextResponse.json({ data: updated });
    }

    // ── RESUME ────────────────────────────────────────────────────────
    if (action === 'resume') {
      if (enrollment.status !== 'paused') {
        return NextResponse.json(
          { error: 'Can only resume paused enrollments' },
          { status: 400 }
        );
      }

      // Load current step to recalculate next_send_at from now
      const { data: currentStep } = await admin
        .from('drip_steps')
        .select('delay_days, delay_hours')
        .eq('sequence_id', id)
        .eq('step_order', enrollment.current_step)
        .eq('is_active', true)
        .single();

      let nextSendAt: string;
      if (currentStep) {
        const delayMs = (currentStep.delay_days * 24 * 60 + (currentStep.delay_hours || 0) * 60) * 60 * 1000;
        nextSendAt = new Date(Date.now() + delayMs).toISOString();
      } else {
        // Step not found or inactive — send immediately so the processor handles it
        nextSendAt = new Date().toISOString();
      }

      const { data: updated, error: updateError } = await admin
        .from('drip_enrollments')
        .update({
          status: 'active',
          next_send_at: nextSendAt,
        })
        .eq('id', enrollId)
        .select('*')
        .single();

      if (updateError) {
        console.error('[Drip API] Resume enrollment failed:', updateError);
        return NextResponse.json({ error: 'Failed to resume enrollment' }, { status: 500 });
      }

      return NextResponse.json({ data: updated });
    }

    // ── CANCEL ────────────────────────────────────────────────────────
    if (action === 'cancel') {
      if (enrollment.status !== 'active' && enrollment.status !== 'paused') {
        return NextResponse.json(
          { error: 'Can only cancel active or paused enrollments' },
          { status: 400 }
        );
      }

      const { data: updated, error: updateError } = await admin
        .from('drip_enrollments')
        .update({
          status: 'stopped',
          stopped_reason: 'manual',
          stopped_at: new Date().toISOString(),
          next_send_at: null,
        })
        .eq('id', enrollId)
        .select('*')
        .single();

      if (updateError) {
        console.error('[Drip API] Cancel enrollment failed:', updateError);
        return NextResponse.json({ error: 'Failed to cancel enrollment' }, { status: 500 });
      }

      return NextResponse.json({ data: updated });
    }

    // ── SKIP ──────────────────────────────────────────────────────────
    if (action === 'skip') {
      if (enrollment.status !== 'active') {
        return NextResponse.json(
          { error: 'Can only skip steps on active enrollments' },
          { status: 400 }
        );
      }

      // Load all steps for this sequence to find the next one
      const { data: steps, error: stepsError } = await admin
        .from('drip_steps')
        .select('step_order, delay_days, delay_hours')
        .eq('sequence_id', id)
        .eq('is_active', true)
        .order('step_order', { ascending: true });

      if (stepsError) {
        console.error('[Drip API] Failed to load steps for skip:', stepsError);
        return NextResponse.json({ error: 'Failed to load sequence steps' }, { status: 500 });
      }

      const nextStepOrder = enrollment.current_step + 1;
      const nextStep = (steps || []).find((s) => s.step_order === nextStepOrder);

      if (nextStep) {
        // Advance to next step with recalculated delay
        const delayMs = (nextStep.delay_days * 24 * 60 + (nextStep.delay_hours || 0) * 60) * 60 * 1000;
        const nextSendAt = new Date(Date.now() + delayMs).toISOString();

        const { data: updated, error: updateError } = await admin
          .from('drip_enrollments')
          .update({
            current_step: nextStepOrder,
            next_send_at: nextSendAt,
          })
          .eq('id', enrollId)
          .select('*')
          .single();

        if (updateError) {
          console.error('[Drip API] Skip step failed:', updateError);
          return NextResponse.json({ error: 'Failed to skip step' }, { status: 500 });
        }

        return NextResponse.json({ data: updated });
      } else {
        // No more steps — mark completed
        const { data: updated, error: updateError } = await admin
          .from('drip_enrollments')
          .update({
            current_step: nextStepOrder,
            status: 'completed',
            next_send_at: null,
          })
          .eq('id', enrollId)
          .select('*')
          .single();

        if (updateError) {
          console.error('[Drip API] Complete enrollment (skip) failed:', updateError);
          return NextResponse.json({ error: 'Failed to complete enrollment' }, { status: 500 });
        }

        return NextResponse.json({ data: updated });
      }
    }

    // Fallback (should never reach here due to validation above)
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[Drip API] Enrollment PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
