import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import {
  createCustomerCredit,
  getCustomerCreditBalance,
} from '@/lib/credits/repository';
import type { CustomerCreditReason } from '@/lib/credits/types';
import { logAudit, getRequestIp } from '@/lib/services/audit';

/**
 * Phase 3 Theme E.3 — admin customer-credits endpoint (AC-15 operator UI).
 *
 * Thin wrapper around the E.1 repository:
 *   - GET → getCustomerCreditBalance (history + totals).
 *   - POST → createCustomerCredit (manual issuance: goodwill, adjustments,
 *     refund-as-credit booked outside cancel flow).
 *
 * Permission model: reuses `customers.adjust_loyalty` for issuance because
 * a manual credit is structurally the same operator action as a manual
 * loyalty ledger write — operator-initiated balance adjustment with audit
 * trail. View is gated only by the admin session itself (Memory: same
 * surface as the loyalty ledger view, which is page-level gated).
 *
 * No business logic here — issuance + balance derivation live in the
 * repository (E.1). E.2's apply path is a separate POS endpoint.
 */

const ISSUANCE_REASONS: readonly CustomerCreditReason[] = [
  'manual_adjustment',
  'goodwill',
  'promotional',
  'refund_as_credit',
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createAdminClient();
    const balance = await getCustomerCreditBalance(supabase, id);
    return NextResponse.json(balance);
  } catch (err) {
    console.error('[admin credits GET] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch customer credits' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(
      employee.id,
      'customers.adjust_loyalty'
    );
    if (denied) return denied;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      amount_cents?: unknown;
      reason?: unknown;
      reason_note?: unknown;
      expires_at?: unknown;
    };

    const amount_cents =
      typeof body.amount_cents === 'number' &&
      Number.isInteger(body.amount_cents) &&
      body.amount_cents > 0
        ? body.amount_cents
        : null;
    const reason =
      typeof body.reason === 'string' &&
      (ISSUANCE_REASONS as readonly string[]).includes(body.reason)
        ? (body.reason as CustomerCreditReason)
        : null;
    const reason_note =
      typeof body.reason_note === 'string' && body.reason_note.trim().length > 0
        ? body.reason_note.trim()
        : undefined;
    const expires_at =
      typeof body.expires_at === 'string' && body.expires_at.length > 0
        ? body.expires_at
        : undefined;

    if (amount_cents === null) {
      return NextResponse.json(
        { error: 'amount_cents must be a positive integer' },
        { status: 400 }
      );
    }
    if (reason === null) {
      return NextResponse.json(
        {
          error: `reason must be one of: ${ISSUANCE_REASONS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const credit = await createCustomerCredit(supabase, {
      customer_id: id,
      amount_cents,
      reason,
      reason_note,
      expires_at,
      created_by_employee_id: employee.id,
    });

    logAudit({
      userId: employee.auth_user_id,
      userEmail: employee.email,
      employeeName: `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim(),
      action: 'create',
      entityType: 'customer_credit',
      entityId: credit.id,
      entityLabel: `Manual credit for customer ${id.slice(0, 8)}`,
      details: {
        credit_id: credit.id,
        customer_id: id,
        amount_cents,
        reason,
        reason_note: reason_note ?? null,
        expires_at: expires_at ?? null,
      },
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json(credit, { status: 201 });
  } catch (err) {
    console.error('[admin credits POST] error:', err);
    return NextResponse.json(
      { error: 'Failed to create customer credit' },
      { status: 500 }
    );
  }
}
