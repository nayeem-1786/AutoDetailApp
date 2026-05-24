import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

/**
 * POST /api/admin/orphan-conversations/purge
 *
 * Hard-deletes the specified conversations (and their messages) ONLY when
 * they have `customer_id IS NULL`. Defensive double-check on the server:
 * even if the UI passes an ID belonging to a customer-bound conversation,
 * this endpoint refuses to touch it — that path is reserved for the main
 * `/api/admin/customers/purge` tool, which knows how to cascade across all
 * the other customer-attached tables.
 *
 * Request body:
 *   { conversationIds: string[] }   // 1-100 UUIDs
 *
 * `messages` CASCADEs from `conversations` via the FK constraint
 * (DB_SCHEMA.md:1389), so the DELETE on conversations is sufficient. We
 * still issue an explicit messages DELETE first so the response carries an
 * accurate per-table deleted count (mirrors the main Purge route's
 * defensive ordering for the same reason).
 *
 * Permission: `settings.manage` (same as the Data Management Purge tool).
 *
 * Context: Workstream J post-Session-2 follow-up — the operator's 2026-05-23
 * test left a conversation orphaned because send_quote_sms (which creates
 * the customer record as a side effect) failed at the "phone is required"
 * gate pre-deploy of commit 09b7eecb. The main Purge tool cannot reach
 * such conversations because its lookup walks customer.phone → conversation,
 * and no customer exists to walk from.
 */
interface DeleteResult {
  table: string;
  deleted: number;
}

interface DeleteError {
  table: string;
  error: string;
}

export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const denied = await requirePermission(employee.id, 'settings.manage');
    if (denied) return denied;

    const body = await request.json();
    const { conversationIds } = body as { conversationIds: string[] };

    if (!conversationIds || !Array.isArray(conversationIds) || conversationIds.length === 0) {
      return NextResponse.json({ error: 'conversationIds array required' }, { status: 400 });
    }
    if (conversationIds.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 conversations per purge' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Server-side guard: verify every requested ID truly is orphaned
    // (customer_id IS NULL). Refuses the whole batch if any row is
    // customer-bound — those belong to the main Purge tool path.
    const { data: validation, error: validationErr } = await supabase
      .from('conversations')
      .select('id, customer_id, phone_number')
      .in('id', conversationIds);

    if (validationErr) {
      console.error('[OrphanConversations purge] validation failed:', validationErr.message);
      return NextResponse.json({ error: 'Failed to validate conversation IDs' }, { status: 500 });
    }

    const validationRows = (validation ?? []) as Array<{
      id: string;
      customer_id: string | null;
      phone_number: string;
    }>;

    if (validationRows.length !== conversationIds.length) {
      const foundIds = new Set(validationRows.map((r) => r.id));
      const missing = conversationIds.filter((id) => !foundIds.has(id));
      return NextResponse.json(
        { error: `Conversation(s) not found: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    const customerBound = validationRows.filter((r) => r.customer_id !== null);
    if (customerBound.length > 0) {
      return NextResponse.json(
        {
          error:
            'Refusing to purge customer-bound conversations via the orphan path. ' +
            'Use Admin > Settings > Data Management > Purge for those.',
          customerBoundIds: customerBound.map((r) => r.id),
        },
        { status: 400 }
      );
    }

    const phones = validationRows.map((r) => r.phone_number);
    const details: DeleteResult[] = [];
    const errors: DeleteError[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function safeDelete(table: string, deleteFn: () => PromiseLike<any>) {
      try {
        const result = await deleteFn();
        if (result?.error) {
          console.error(`[OrphanConversations purge] ${table} error:`, result.error.message);
          errors.push({ table, error: result.error.message });
        } else {
          details.push({ table, deleted: result?.count ?? 0 });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[OrphanConversations purge] ${table} exception:`, msg);
        errors.push({ table, error: msg });
      }
    }

    // Defensive ordering: messages first for an accurate deleted count,
    // then conversations. The FK CASCADE on messages would have handled
    // the second step alone, but explicit ordering gives the operator
    // visibility into how many messages were dropped.
    await safeDelete('messages', () =>
      supabase.from('messages').delete({ count: 'exact' }).in('conversation_id', conversationIds)
    );
    await safeDelete('conversations', () =>
      supabase.from('conversations').delete({ count: 'exact' }).in('id', conversationIds)
    );

    console.log(
      `[OrphanConversations purge] Completed: ${conversationIds.length} orphan(s) purged by ` +
      `${employee.first_name} ${employee.last_name} | phones: ${phones.join(', ')} | ` +
      `tables: ${details.length} succeeded, ${errors.length} failed`
    );

    return NextResponse.json({
      success: errors.length === 0,
      purgedCount: conversationIds.length,
      details,
      errors,
    });
  } catch (err) {
    console.error('[OrphanConversations purge] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
