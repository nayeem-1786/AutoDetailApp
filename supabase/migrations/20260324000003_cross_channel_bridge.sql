-- Cross-channel bridge: unified SMS + voice conversation threads
-- Add channel column to messages (sms or voice)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'sms';
ALTER TABLE messages ADD CONSTRAINT messages_channel_check CHECK (channel IN ('sms', 'voice'));

-- Voice call metadata
ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_duration_seconds INTEGER;

-- Track which channel was last used in a conversation
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_channel TEXT NOT NULL DEFAULT 'sms';
ALTER TABLE conversations ADD CONSTRAINT conversations_last_channel_check CHECK (last_channel IN ('sms', 'voice'));
