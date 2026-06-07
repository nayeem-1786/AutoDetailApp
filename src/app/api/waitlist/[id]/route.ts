import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/utils/sms';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';

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

    // Notify the customer when the admin marks the entry as 'notified'.
    if (status === 'notified') {
      // Session 1.8.1 — direct SMS dispatch (mirrors Session 1.8 cancel-route
      // pattern at appointments/[id]/cancel/route.ts:174-194). Pre-1.8.1 the
      // dispatch was via fireWebhook only — same customer-facing silent-drop
      // bug class as Session 1.8 (no n8n receiver wired in prod per audit
      // f5e714a8). The webhook fire is kept below for forward-compat.
      const phone = current.customer?.phone;
      const serviceName = current.service?.name ?? 'your requested service';
      const preferredDate = current.preferred_date as string | null;
      // Admin PATCH has no freed-appointment date; use the customer's
      // preferred_date as the slot date (the existing webhook payload uses
      // the same field). When phone OR preferred_date is missing, skip SMS —
      // the row still flips to notified and the admin can follow up directly.
      if (phone && preferredDate) {
        const slotDateStr = new Date(preferredDate + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        });
        const firstName = current.customer?.first_name ?? undefined;
        const smsFallback = `Hi ${firstName ?? 'there'}, good news — a spot just opened for ${serviceName} on ${slotDateStr}! Reply or call to book.`;
        const smsResult = await renderSmsTemplate('waitlist_slot_available', {
          service_name: serviceName,
          appointment_date: slotDateStr,
          first_name: firstName,
          last_name: current.customer?.last_name ?? undefined,
        }, smsFallback);

        if (smsResult.isActive) {
          await sendSms(phone, smsResult.body, {
            logToConversation: true,
            customerId: current.customer_id,
            notificationType: 'waitlist_slot_available',
            contextId: id,
          });
        }
      }

      // Theme G — forward-compat webhook fire removed. Direct sendSms above
      // is the actual customer notification channel; no n8n receiver is
      // wired in Smart Details (audit f5e714a8).
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
