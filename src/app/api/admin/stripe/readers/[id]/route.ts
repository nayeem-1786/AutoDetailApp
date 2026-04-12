import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

// DELETE: Delete a reader
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const denied = await requirePermission(employee.id, 'settings.tax_payment');
    if (denied) return denied;

    const { id } = await params;

    await stripe.terminal.readers.del(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete reader error:', err);
    const message = err instanceof Error ? err.message : 'Failed to delete reader';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
