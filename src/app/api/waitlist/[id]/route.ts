import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fireWebhook } from '@/lib/utils/webhook';

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  waiting: ['notified', 'booked', 'cancelled'],
  notified: ['booked', 'cancelled'],
  booked: [],
  expired: [],
  cancelled: [],
};

/**
 * PATCH /api/waitlist/[id] — Admin: update waitlist entry status.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !['notified', 'booked', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: notified, booked, cancelled' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch current entry to validate transition
    const { data: current, error: fetchErr } = await supabase
      .from('waitlist_entries')
      .select('*, customer:customers!customer_id(first_name, last_name, phone), service:services!service_id(name)')
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json(
        { error: 'Waitlist entry not found' },
        { status: 404 }
      );
    }

    // Validate status transition
    const allowed = VALID_STATUS_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${current.status}' to '${status}'` },
        { status: 400 }
      );
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = { status };
    if (status === 'notified') {
      updatePayload.notified_at = new Date().toISOString();
    }

    const { data: updated, error: updateErr } = await supabase
      .from('waitlist_entries')
      .update(updatePayload)
      .eq('id', id)
      .select('*, customer:customers!customer_id(first_name, last_name, phone), service:services!service_id(name)')
      .single();

    if (updateErr) {
      console.error('Waitlist PATCH error:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to update waitlist entry' },
        { status: 500 }
      );
    }

    // Fire webhook when notifying a customer
    if (status === 'notified') {
      fireWebhook('appointment_cancelled', {
        event: 'waitlist_notified',
        waitlist_entry_id: id,
        customer_id: current.customer_id,
        service_id: current.service_id,
        customer_name: current.customer
          ? `${current.customer.first_name} ${current.customer.last_name}`
          : null,
        customer_phone: current.customer?.phone ?? null,
        service_name: current.service?.name ?? null,
        preferred_date: current.preferred_date,
      }, supabase).catch((err) =>
        console.error('Waitlist notification webhook failed:', err)
      );
    }

    return NextResponse.json({ entry: updated });
  } catch (err) {
    console.error('Waitlist PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/waitlist/[id] — Admin: remove a waitlist entry.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('waitlist_entries')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Waitlist DELETE error:', error.message);
      return NextResponse.json(
        { error: 'Failed to delete waitlist entry' },
        { status: 500 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('Waitlist DELETE error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
