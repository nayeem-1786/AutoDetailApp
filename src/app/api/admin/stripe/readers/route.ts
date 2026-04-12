import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

// GET: List all readers
export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const denied = await requirePermission(employee.id, 'settings.tax_payment');
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const location = searchParams.get('location');

    const params: Stripe.Terminal.ReaderListParams = { limit: 100 };
    if (location) {
      params.location = location;
    }

    const readers = await stripe.terminal.readers.list(params);

    return NextResponse.json({ readers: readers.data });
  } catch (err) {
    console.error('List readers error:', err);
    return NextResponse.json(
      { error: 'Failed to list readers' },
      { status: 500 }
    );
  }
}
