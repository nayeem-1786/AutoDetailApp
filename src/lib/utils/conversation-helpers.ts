/**
 * Conversation lookup/creation helper for system SMS logging.
 * Ensures every customer-facing SMS has a conversation in the messaging thread.
 *
 * Never throws — returns null on error. Logging must not break SMS sends.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = { from: (table: string) => any };

/**
 * Find an existing conversation by phone number, or create one.
 * If a conversation exists but has no customer_id and one is provided, backfills it.
 * Handles unique constraint races (concurrent creates for the same phone).
 */
export async function findOrCreateConversation(
  supabase: SupabaseClient,
  phone: string,
  customerId?: string | null
): Promise<string | null> {
  try {
    // Look up existing conversation
    const { data: existing } = await supabase
      .from('conversations')
      .select('id, customer_id')
      .eq('phone_number', phone)
      .single();

    if (existing) {
      // Backfill customer_id if missing
      if (customerId && !existing.customer_id) {
        await supabase
          .from('conversations')
          .update({ customer_id: customerId })
          .eq('id', existing.id)
          .is('customer_id', null);
      }
      return existing.id;
    }

    // Create new conversation
    const { data: created, error: createErr } = await supabase
      .from('conversations')
      .insert({
        phone_number: phone,
        customer_id: customerId || null,
        is_ai_enabled: true,
        status: 'open',
        last_message_at: new Date().toISOString(),
        last_channel: 'sms',
        unread_count: 0,
      })
      .select('id')
      .single();

    if (created) return created.id;

    // Unique constraint race — another process created it first. Retry select.
    if (createErr?.code === '23505') {
      const { data: retried } = await supabase
        .from('conversations')
        .select('id')
        .eq('phone_number', phone)
        .single();
      return retried?.id || null;
    }

    console.error('[ConversationHelper] Failed to create conversation:', createErr);
    return null;
  } catch (err) {
    console.error('[ConversationHelper] Unexpected error:', err);
    return null;
  }
}
