import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

// POST: Register a reader with pairing code
export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const denied = await requirePermission(employee.id, 'settings.tax_payment');
    if (denied) return denied;

    const body = await request.json();
    const { registration_code, label, location } = body;

    if (!registration_code) {
      return NextResponse.json(
        { error: 'registration_code is required' },
        { status: 400 }
      );
    }

    if (!location) {
      return NextResponse.json(
        { error: 'location is required' },
        { status: 400 }
      );
    }

    const reader = await stripe.terminal.readers.create({
      registration_code,
      label: label || 'POS Reader',
      location,
    });

    return NextResponse.json({ reader });
  } catch (err) {
    console.error('Register reader error:', err);
    const message = err instanceof Error ? err.message : 'Failed to register reader';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
