/**
 * getConversationHistory — fetch messages from a conversation thread.
 *
 * Small helper for callers that need ONLY message history, not the full
 * customer-context bundle. `getCustomerContext` (this directory) uses this
 * internally for its conversation_history field; the SMS AI v2 runner and
 * any other caller that needs JUST messages can use it directly.
 *
 * Resolution order: conversationId wins over phone. If neither is provided,
 * returns []. If phone is provided but doesn't map to a conversation,
 * returns [].
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';

export type ConversationMessageSenderType =
  | 'customer'
  | 'staff'
  | 'ai'
  | 'system';

export interface ConversationMessage {
  id: string;
  sender_type: ConversationMessageSenderType;
  direction: 'inbound' | 'outbound';
  body: string;
  channel: string | null;
  created_at: string;
}

export interface GetConversationHistoryParams {
  conversationId?: string;
  phone?: string;
  /** Max messages to return. Default 20. Returned in chronological order (oldest first). */
  limit?: number;
  /** When true, drop sender_type='system' messages from the result. Default false. */
  excludeSystemMessages?: boolean;
}

export async function getConversationHistory(
  params: GetConversationHistoryParams,
): Promise<ConversationMessage[]> {
  const limit = params.limit ?? 20;
  const admin = createAdminClient();

  let conversationId = params.conversationId;
  if (!conversationId && params.phone) {
    const normalized = normalizePhone(params.phone);
    if (!normalized) return [];
    const { data: conv } = await admin
      .from('conversations')
      .select('id')
      .eq('phone_number', normalized)
      .maybeSingle();
    if (!conv) return [];
    conversationId = conv.id;
  }

  if (!conversationId) return [];

  // Fetch newest-first to honor `limit` against the latest messages, then
  // reverse so callers consume in chronological order.
  const { data, error } = await admin
    .from('messages')
    .select('id, sender_type, direction, body, channel, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const chronological = [...data].reverse() as ConversationMessage[];
  return params.excludeSystemMessages
    ? chronological.filter((m) => m.sender_type !== 'system')
    : chronological;
}
