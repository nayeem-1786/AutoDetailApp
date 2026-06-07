import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import {
  applyCustomerCreditsToTransaction,
  InsufficientCreditBalanceError,
} from '@/lib/credits/repository';
import { logAudit, getRequestIp } from '@/lib/services/audit';

/**
 * POST /api/pos/transactions/[id]/apply-credit
 *
 * Phase 3 Theme E.2 — apply customer credits to a transaction (AC-15 application logic).
 *
 * Credits are NOT a payment method — they're a discount applied BEFORE payment
 * processing. The checkout caller computes target_amount_cents ≤ customer's
 * available balance, calls this endpoint, then collects cash/card for the
 * REMAINING amount due.
 *
 * Race-safety lives in the repository layer (.is('applied_at', null) precondition
 * on the UPDATE). This endpoint is a thin wrapper around the repository call +
 * permission check + audit log.
 *
 * Gating: pos.process_cash — credits behave like a stored-value tender (customer
 * money pre-paid; this consumes it), so the same permission that gates cash/digital
 * checkout applies. NOT pos.manual_discounts — operator is not granting a discount,
 * they're spending pre-existing customer balance.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: transactionId } = await params;

    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const granted = await checkPosPermission(
      supabase,
      posEmployee.role,
      posEmployee.employee_id,
      'pos.process_cash'
    );
    if (!granted) {
      return NextResponse.json(
        { error: 'Forbidden: cannot apply customer credits' },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      customer_id?: unknown;
      amount_cents?: unknown;
      appointment_id?: unknown;
    };

    const customer_id =
      typeof body.customer_id === 'string' ? body.customer_id : null;
    const amount_cents =
      typeof body.amount_cents === 'number' &&
      Number.isInteger(body.amount_cents)
        ? body.amount_cents
        : null;
    const appointment_id =
      typeof body.appointment_id === 'string' && body.appointment_id.length > 0
        ? body.appointment_id
        : undefined;

    if (!customer_id || amount_cents === null || amount_cents <= 0) {
      return NextResponse.json(
        {
          error:
            'customer_id (string) and amount_cents (positive integer) are required',
        },
        { status: 400 }
      );
    }

    try {
      const result = await applyCustomerCreditsToTransaction(supabase, {
        customer_id,
        target_amount_cents: amount_cents,
        applied_to_transaction_id: transactionId,
        applied_to_appointment_id: appointment_id,
      });

      // Audit each application individually so the trail mirrors the ledger:
      // one credit row → one audit row. Fire-and-forget (logAudit never throws).
      for (const applied of result.applied_credits) {
        logAudit({
          userId: posEmployee.auth_user_id,
          userEmail: posEmployee.email,
          employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
          action: 'apply',
          entityType: 'customer_credit',
          entityId: applied.id,
          entityLabel: `Credit ${applied.id.slice(0, 8)} → Transaction ${transactionId.slice(0, 8)}`,
          details: {
            credit_id: applied.id,
            customer_id,
            applied_amount_cents: applied.applied_amount_cents,
            credit_amount_cents: applied.amount_cents,
            applied_to_transaction_id: transactionId,
            applied_to_appointment_id: appointment_id ?? null,
            reason: applied.reason,
          },
          ipAddress: getRequestIp(request),
          source: 'pos',
        });
      }

      return NextResponse.json({
        success: true,
        applied_credits: result.applied_credits,
        total_applied_cents: result.total_applied_cents,
        remaining_balance_cents: result.remaining_balance_cents,
      });
    } catch (err) {
      if (err instanceof InsufficientCreditBalanceError) {
        return NextResponse.json(
          {
            error: 'Insufficient credit balance',
            code: 'insufficient_credit_balance',
            requested_cents: err.requestedCents,
            available_cents: err.availableCents,
          },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err) {
    console.error('[apply-credit] error:', err);
    return NextResponse.json(
      { error: 'Failed to apply credits' },
      { status: 500 }
    );
  }
}
