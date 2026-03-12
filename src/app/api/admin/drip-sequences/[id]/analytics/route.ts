import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Params = { params: Promise<{ id: string }> };

// ─── GET: Funnel + conversion analytics for a drip sequence ─────────

export async function GET(_request: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
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

    // ── 1. Enrollment breakdown by status ──────────────────────────
    const [
      { count: total },
      { count: active },
      { count: completed },
      { count: stopped },
      { count: paused },
    ] = await Promise.all([
      admin.from('drip_enrollments').select('*', { count: 'exact', head: true }).eq('sequence_id', id),
      admin.from('drip_enrollments').select('*', { count: 'exact', head: true }).eq('sequence_id', id).eq('status', 'active'),
      admin.from('drip_enrollments').select('*', { count: 'exact', head: true }).eq('sequence_id', id).eq('status', 'completed'),
      admin.from('drip_enrollments').select('*', { count: 'exact', head: true }).eq('sequence_id', id).eq('status', 'stopped'),
      admin.from('drip_enrollments').select('*', { count: 'exact', head: true }).eq('sequence_id', id).eq('status', 'paused'),
    ]);

    const totalCount = total ?? 0;
    const activeCount = active ?? 0;
    const completedCount = completed ?? 0;
    const stoppedCount = stopped ?? 0;
    const pausedCount = paused ?? 0;

    // ── 2. Funnel data from drip_send_log ──────────────────────────
    // Get all enrollment IDs for this sequence
    const { data: enrollmentRows } = await admin
      .from('drip_enrollments')
      .select('id')
      .eq('sequence_id', id);

    const enrollmentIds = (enrollmentRows || []).map((e) => e.id);

    // Build funnel from send log
    let funnelData: { step_order: number; sent: number; failed: number; skipped: number }[] = [];

    if (enrollmentIds.length > 0) {
      // Fetch all send log entries for these enrollments
      const { data: sendLogs } = await admin
        .from('drip_send_log')
        .select('step_order, status')
        .in('enrollment_id', enrollmentIds);

      // Group by step_order + status in application code
      const funnelMap = new Map<number, { sent: number; failed: number; skipped: number }>();

      for (const log of sendLogs || []) {
        const existing = funnelMap.get(log.step_order) || { sent: 0, failed: 0, skipped: 0 };

        if (log.status === 'sent') {
          existing.sent++;
        } else if (log.status === 'failed') {
          existing.failed++;
        } else if (log.status === 'skipped') {
          existing.skipped++;
        }

        funnelMap.set(log.step_order, existing);
      }

      // Convert map to sorted array
      funnelData = Array.from(funnelMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([step_order, counts]) => ({
          step_order,
          ...counts,
        }));
    }

    // ── 3. Drop-off reasons ────────────────────────────────────────
    const { data: stoppedEnrollments } = await admin
      .from('drip_enrollments')
      .select('stopped_reason')
      .eq('sequence_id', id)
      .eq('status', 'stopped')
      .not('stopped_reason', 'is', null);

    // Group by stopped_reason in application code
    const reasonMap = new Map<string, number>();
    for (const enrollment of stoppedEnrollments || []) {
      if (enrollment.stopped_reason) {
        const current = reasonMap.get(enrollment.stopped_reason) || 0;
        reasonMap.set(enrollment.stopped_reason, current + 1);
      }
    }

    const dropoff = Array.from(reasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // ── 4. Conversion ──────────────────────────────────────────────
    const purchasedCount = reasonMap.get('purchased') || 0;
    const bookedCount = reasonMap.get('booked') || 0;
    const conversionRate = totalCount > 0
      ? Math.round(((purchasedCount + bookedCount) / totalCount) * 100)
      : 0;

    // ── 5. Load step names to label the funnel ─────────────────────
    const { data: steps } = await admin
      .from('drip_steps')
      .select('step_order, template_id, subject_override')
      .eq('sequence_id', id)
      .eq('is_active', true)
      .order('step_order', { ascending: true });

    // Batch-fetch template names for steps that have template_id
    const templateIds = (steps || [])
      .map((s) => s.template_id)
      .filter((tid): tid is string => tid !== null);

    const templateNameMap: Record<string, string> = {};

    if (templateIds.length > 0) {
      const { data: templates } = await admin
        .from('email_templates')
        .select('id, name')
        .in('id', templateIds);

      if (templates) {
        for (const t of templates) {
          templateNameMap[t.id] = t.name;
        }
      }
    }

    // Build step name map: step_order -> name
    const stepNameMap = new Map<number, string>();
    for (const step of steps || []) {
      const name = step.subject_override
        || (step.template_id && templateNameMap[step.template_id])
        || `Step ${step.step_order + 1}`;
      stepNameMap.set(step.step_order, name);
    }

    // Enrich funnel data with step names
    const funnel = funnelData.map((f) => ({
      ...f,
      step_name: stepNameMap.get(f.step_order) || `Step ${f.step_order + 1}`,
    }));

    // If there are steps without any sends yet, include them with zero counts
    for (const step of steps || []) {
      if (!funnelData.some((f) => f.step_order === step.step_order)) {
        funnel.push({
          step_order: step.step_order,
          step_name: stepNameMap.get(step.step_order) || `Step ${step.step_order + 1}`,
          sent: 0,
          failed: 0,
          skipped: 0,
        });
      }
    }

    // Re-sort after adding empty steps
    funnel.sort((a, b) => a.step_order - b.step_order);

    return NextResponse.json({
      data: {
        enrollments: {
          total: totalCount,
          active: activeCount,
          completed: completedCount,
          stopped: stoppedCount,
          paused: pausedCount,
        },
        funnel,
        dropoff,
        conversion: {
          total_enrolled: totalCount,
          purchased: purchasedCount,
          booked: bookedCount,
          conversion_rate: conversionRate,
        },
      },
    });
  } catch (err) {
    console.error('[Drip API] Analytics GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
