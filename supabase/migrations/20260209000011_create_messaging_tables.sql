-- Messaging tables for two-way SMS inbox
-- Replaces the flat sms_conversations table with a proper conversations + messages structure

-- =========================================================================
-- conversations table
-- =========================================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  is_ai_enabled BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phone_number)
);

CREATE INDEX idx_conversations_customer ON conversations(customer_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX idx_conversations_status ON conversations(status);

-- =========================================================================
-- messages table
-- =========================================================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  media_url TEXT,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'staff', 'ai', 'system')),
  sent_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  twilio_sid TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'received')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_twilio ON messages(twilio_sid);

-- =========================================================================
-- Enable Realtime
-- =========================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- =========================================================================
-- RLS Policies
-- =========================================================================

-- Conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update conversations"
  ON conversations FOR UPDATE
  TO authenticated
  USING (true);

-- Messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read messages"
  ON messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Service role (used by createAdminClient()) bypasses RLS automatically.
-- The inbound webhook uses createAdminClient() which has service_role, so RLS is bypassed.

-- =========================================================================
-- updated_at trigger for conversations
-- =========================================================================
CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
