import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { appointmentCancelSchema } from '@/lib/utils/validation';

const TERMINAL_STATUSES = ['completed', 'cancelled'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = appointmentCancelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = createAdminClient();

    // Fetch current appointment
    const { data: current, error: fetchErr } = await supabase
      .from('appointments')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Guard terminal states
    if (TERMINAL_STATUSES.includes(current.status)) {
      return NextResponse.json(
        { error: `Cannot cancel an appointment that is already ${current.status}` },
        { status: 400 }
      );
    }

    const { data: updated, error: updateErr } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancellation_reason: data.cancellation_reason,
        cancellation_fee: data.cancellation_fee ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, status')
      .single();

    if (updateErr) {
      console.error('Appointment cancel failed:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to cancel appointment' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, appointment: updated });
  } catch (err) {
    console.error('Appointment cancel error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
