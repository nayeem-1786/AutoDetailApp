// Phase Mobile-1.1 — PATCH /api/customer/profile/address
//
// Save a free-text address (typed at booking) into the authenticated
// customer's structured profile columns. Called by the BookingConfirmation
// "Update my address" banner. Distinct from the POS endpoint because it
// uses customer session auth (RLS/cookie), not POS HMAC + staff permission.
//
// Authorization: the booking_id must belong to the authenticated customer's
// record. This prevents a logged-in customer from rewriting their address
// using someone else's booking confirmation URL (defense-in-depth — the
// session-derived customer_id is the actual write target, but we still
// require the booking to match).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseAddressString } from '@/lib/utils/format-address';

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const enteredAddress = typeof body?.entered_address === 'string' ? body.entered_address : '';
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : '';
    const trimmed = enteredAddress.trim();

    if (!trimmed) {
      return NextResponse.json({ error: 'entered_address is required' }, { status: 400 });
    }
    if (trimmed.length > 200) {
      return NextResponse.json(
        { error: 'entered_address must be 200 characters or fewer' },
        { status: 400 }
      );
    }
    if (!bookingId) {
      return NextResponse.json({ error: 'booking_id is required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Resolve the session's customer record.
    const { data: customer, error: custErr } = await admin
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (custErr || !customer) {
      return NextResponse.json({ error: 'Customer record not found' }, { status: 404 });
    }

    // Verify the booking belongs to this customer.
    const { data: appointment, error: apptErr } = await admin
      .from('appointments')
      .select('id, customer_id')
      .eq('id', bookingId)
      .single();

    if (apptErr || !appointment) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    if (appointment.customer_id !== customer.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = parseAddressString(trimmed);
    const updates = {
      address_line_1: parsed.address_line_1 || trimmed.slice(0, 200),
      address_line_2: parsed.address_line_2,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updErr } = await admin
      .from('customers')
      .update(updates)
      .eq('id', customer.id)
      .select(
        'id, first_name, last_name, phone, email, address_line_1, address_line_2, city, state, zip'
      )
      .single();

    if (updErr || !updated) {
      console.error('Customer profile address update error:', updErr);
      return NextResponse.json({ error: 'Failed to update address' }, { status: 500 });
    }

    return NextResponse.json({ customer: updated });
  } catch (err) {
    console.error('Customer profile address PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
