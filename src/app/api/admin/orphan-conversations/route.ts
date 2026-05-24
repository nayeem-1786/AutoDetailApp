import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

/**
 * GET /api/admin/orphan-conversations
 *
 * Lists conversations where `customer_id IS NULL` — i.e. conversations born
 * from inbounds whose customer record was never created. Common cause:
 * `send_quote_sms` / `create_appointment` failed before the side-effect
 * customer INSERT could run (e.g. pre-2026-05-23 phone-injection bug —
 * commit 09b7eecb). Without this listing the operator has no UI path to
 * these conversations: the existing Purge tool requires selecting a
 * customer first, and there is no customer to select.
 *
 * Returns each orphan with phone, last_message_at, and a fresh message
 * count so the operator can decide which to keep vs purge before calling
 * the companion POST /api/admin/orphan-conversations/purge endpoint.
 *
 * Permission: `settings.manage` (same as the Data Management Purge tool).
 */
export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const denied = await requirePermission(employee.id, 'settings.manage');
    if (denied) return denied;

    const supabase = createAdminClient();

    // Pull the orphan conversation rows. Order by last_message_at DESC so
    // the operator sees the freshest (most-relevant-to-the-current-test)
    // entries at the top.
    const { data: convs, error: convErr } = await supabase
      .from('conversations')
      .select('id, phone_number, last_message_at, created_at, status')
      .is('customer_id', null)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (convErr) {
      console.error('[OrphanConversations] list failed:', convErr.message);
      return NextResponse.json(
        { error: 'Failed to load orphan conversations' },
        { status: 500 }
      );
    }

    const conversationIds = (convs ?? []).map((c) => c.id);

    // Fan out one message-count query per conversation in a single round
    // trip via grouped aggregate. Supabase-js doesn't natively support
    // GROUP BY through its query builder, so fetch all messages.id for the
    // matched conversations and bucket in-process. Small enough at the
    // expected scale (orphan counts have been <50 across the project's
    // entire lifetime as of 2026-05-23).
    const messageCountByConv = new Map<string, number>();
    if (conversationIds.length > 0) {
      const { data: msgs, error: msgErr } = await supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', conversationIds);
      if (msgErr) {
        console.error('[OrphanConversations] message count failed:', msgErr.message);
        // Non-fatal — return conversations with zero counts rather than 500.
      }
      for (const row of (msgs ?? []) as Array<{ conversation_id: string }>) {
        const prev = messageCountByConv.get(row.conversation_id) ?? 0;
        messageCountByConv.set(row.conversation_id, prev + 1);
      }
    }

    return NextResponse.json({
      conversations: (convs ?? []).map((c) => ({
        id: c.id,
        phone_number: c.phone_number,
        last_message_at: c.last_message_at,
        created_at: c.created_at,
        status: c.status,
        message_count: messageCountByConv.get(c.id) ?? 0,
      })),
    });
  } catch (err) {
    console.error('[OrphanConversations] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
