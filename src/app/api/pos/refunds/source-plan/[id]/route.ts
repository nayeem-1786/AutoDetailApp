import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import {
  isCloseOutTransaction,
  resolveRefundSourcePlan,
} from '@/lib/refunds/source-plan';

/**
 * GET /api/pos/refunds/source-plan/[id]
 *
 * Returns the LIFO source plan that the refund route would walk when
 * refunding this transaction. Used by the refund modal to render the
 * "Refund will be issued from:" section before the staff member commits.
 *
 * Walk-in transactions (no appointment_id) and appointment-linked
 * transactions with no refundable siblings return an empty plan — the
 * modal hides the section in that case.
 *
 * Read-only. Same shared helper as the refund POST route, so the displayed
 * plan cannot drift from what gets executed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createAdminClient();

    const { data: tx, error } = await supabase
      .from('transactions')
      .select(
        'id, appointment_id, notes, total_amount, tip_amount, payments(*)'
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[refunds/source-plan] tx lookup failed', { id, error: error.message });
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const isCloseOut = isCloseOutTransaction({
      notes: tx.notes,
      appointment_id: tx.appointment_id,
      payments: (tx.payments ?? []) as Array<{ amount: number }>,
    });

    // LEGACY: pre-Phase 0a walk-in transactions (appointment_id IS NULL).
    // Post-0a walk-ins carry a synthetic appointment_id and follow the
    // appointment-linked plan path below. This branch only matches historical
    // rows; eventual migration possible once all pre-0a walk-ins close out.
    if (!isCloseOut && !tx.appointment_id) {
      return NextResponse.json({ data: { isCloseOut: false, sources: [] } });
    }

    const sources = await resolveRefundSourcePlan(supabase, {
      id: tx.id,
      appointment_id: tx.appointment_id,
    });

    return NextResponse.json({
      data: {
        isCloseOut,
        sources,
      },
    });
  } catch (err) {
    console.error('[refunds/source-plan] error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
