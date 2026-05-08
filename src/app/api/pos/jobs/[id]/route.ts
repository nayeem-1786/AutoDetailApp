import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import { toCents } from '@/lib/utils/refund-math';

const JOB_SELECT = `
  *,
  customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone, email),
  vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color, size_class),
  assigned_staff:employees!jobs_assigned_staff_id_fkey(id, first_name, last_name),
  appointment:appointments!jobs_appointment_id_fkey(id, status, payment_status, total_amount, channel),
  addons:job_addons(*)
`;

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

interface JobWithAppointment {
  appointment_id: string | null;
  appointment?: {
    id: string;
    status: string;
    payment_status: string;
    total_amount: number;
    channel?: string;
    amount_due_cents?: number;
  } | null;
  [key: string]: unknown;
}

/**
 * Compute and attach `appointment.amount_due_cents` to a job row that already
 * has the joined appointment data from JOB_SELECT. Mirrors the refund-math
 * approach used by /api/pos/appointments/[id]/send-payment-link and the
 * /pay/[token] page so all three surfaces agree on what's owed. No-op when
 * the job has no linked appointment.
 */
async function attachAmountDueCents(
  supabase: SupabaseAdminClient,
  job: JobWithAppointment
): Promise<void> {
  const appt = job.appointment;
  if (!appt) return;

  const totalCents = toCents(Number(appt.total_amount));

  const { data: txs } = await supabase
    .from('transactions')
    .select('id')
    .eq('appointment_id', appt.id);

  const txIds = (txs ?? []).map((t) => t.id);
  let paidCents = 0;
  if (txIds.length > 0) {
    const { data: pays } = await supabase
      .from('payments')
      .select('amount')
      .in('transaction_id', txIds);
    paidCents = (pays ?? []).reduce(
      (sum, p) => sum + toCents(Number(p.amount)),
      0
    );
  }

  appt.amount_due_cents = Math.max(0, totalCents - paidCents);
}

/**
 * GET /api/pos/jobs/[id] — Get job detail with relations
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data: job, error } = await supabase
      .from('jobs')
      .select(JOB_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Job detail error:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 });
    }

    await attachAmountDueCents(supabase, job as unknown as JobWithAppointment);

    return NextResponse.json({ data: job });
  } catch (err) {
    console.error('Job detail route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Fields that require pos.jobs.manage permission and non-terminal status
const MANAGE_FIELDS = ['customer_id', 'vehicle_id', 'services', 'intake_notes'];

// Fields that can be updated without manage permission (workflow fields)
const WORKFLOW_FIELDS = [
  'status',
  'assigned_staff_id',
  'intake_started_at',
  'intake_completed_at',
  'work_started_at',
  'work_completed_at',
  'timer_seconds',
  'timer_paused_at',
  'estimated_pickup_at',
  'transaction_id',
];

const TERMINAL_STATUSES = ['completed', 'closed', 'cancelled'];

/**
 * PATCH /api/pos/jobs/[id] — Update job fields
 * Editable fields (customer_id, vehicle_id, services, intake_notes) require pos.jobs.manage
 * and the job must NOT be in a terminal status (completed/closed/cancelled).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const body = await request.json();

    // Check if any manage-only fields are being updated
    const hasManageFields = MANAGE_FIELDS.some((f) => f in body);

    if (hasManageFields) {
      // Permission check
      const canManage = await checkPosPermission(
        supabase,
        posEmployee.role,
        posEmployee.employee_id,
        'pos.jobs.manage'
      );
      if (!canManage) {
        return NextResponse.json(
          { error: 'You don\'t have permission to edit job details' },
          { status: 403 }
        );
      }

      // Status check — cannot edit terminal jobs
      const { data: currentJob } = await supabase
        .from('jobs')
        .select('status')
        .eq('id', id)
        .single();

      if (currentJob && TERMINAL_STATUSES.includes(currentJob.status)) {
        return NextResponse.json(
          { error: 'Cannot edit a job that is completed, closed, or cancelled' },
          { status: 400 }
        );
      }
    }

    const allAllowedFields = [...WORKFLOW_FIELDS, ...MANAGE_FIELDS];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allAllowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', id)
      .select(JOB_SELECT)
      .single();

    if (error) {
      console.error('Job update error:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
    }

    await attachAmountDueCents(supabase, job as unknown as JobWithAppointment);

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'update',
      entityType: 'job',
      entityId: id,
      entityLabel: `Job #${id.slice(0, 8)}`,
      details: { updated_fields: Object.keys(updates).filter((k) => k !== 'updated_at') },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    return NextResponse.json({ data: job });
  } catch (err) {
    console.error('Job update route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
