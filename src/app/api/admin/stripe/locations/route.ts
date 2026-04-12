import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

// GET: List all locations
export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const denied = await requirePermission(employee.id, 'settings.tax_payment');
    if (denied) return denied;

    const locations = await stripe.terminal.locations.list({ limit: 100 });

    return NextResponse.json({ locations: locations.data });
  } catch (err) {
    console.error('List locations error:', err);
    return NextResponse.json(
      { error: 'Failed to list locations' },
      { status: 500 }
    );
  }
}

// POST: Create a new location
export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const denied = await requirePermission(employee.id, 'settings.tax_payment');
    if (denied) return denied;

    const body = await request.json();
    const { display_name, address } = body;

    if (!display_name) {
      return NextResponse.json(
        { error: 'display_name is required' },
        { status: 400 }
      );
    }

    // Address is required by Stripe - use a default if not provided
    const locationAddress = address || {
      line1: '1234 Main St',
      city: 'Los Angeles',
      state: 'CA',
      postal_code: '90001',
      country: 'US',
    };

    const location = await stripe.terminal.locations.create({
      display_name,
      address: locationAddress,
    });

    return NextResponse.json({ location });
  } catch (err) {
    console.error('Create location error:', err);
    const message = err instanceof Error ? err.message : 'Failed to create location';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
