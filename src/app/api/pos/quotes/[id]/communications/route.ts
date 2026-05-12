import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createAdminClient();

    const { data: communications, error } = await supabase
      .from('quote_communications')
      .select('*')
      .eq('quote_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching communications:', error.message);
      return NextResponse.json({ error: 'Failed to fetch communications' }, { status: 500 });
    }

    // Phase Messaging-2: JOIN to sms_delivery_log via twilio_sid so the
    // dashboard reflects the latest Twilio status (delivered/undelivered/etc).
    // There's no FK between these tables, so do a manual lookup keyed by SID.
    const sids = (communications ?? [])
      .map((c) => c.twilio_sid)
      .filter((s): s is string => Boolean(s));

    let deliveryBySid: Record<
      string,
      { status: string; error_code: string | null; updated_at: string | null }
    > = {};
    if (sids.length > 0) {
      const { data: deliveryRows } = await supabase
        .from('sms_delivery_log')
        .select('message_sid, status, error_code, updated_at')
        .in('message_sid', sids);
      deliveryBySid = (deliveryRows ?? []).reduce(
        (acc, row) => {
          acc[row.message_sid] = {
            status: row.status,
            error_code: row.error_code,
            updated_at: row.updated_at,
          };
          return acc;
        },
        {} as typeof deliveryBySid
      );
    }

    const enriched = (communications ?? []).map((c) => {
      const delivery = c.twilio_sid ? deliveryBySid[c.twilio_sid] : undefined;
      return {
        ...c,
        delivery_status: delivery?.status ?? null,
        delivery_error_code: delivery?.error_code ?? null,
        delivery_updated_at: delivery?.updated_at ?? null,
      };
    });

    return NextResponse.json({ communications: enriched });
  } catch (err) {
    console.error('POS Quote communications GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
