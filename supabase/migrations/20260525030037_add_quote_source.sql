-- Phase Quote-Source-1: track which channel a quote originated from so the
-- public quote page can render an accurate source label (Q-0084 root cause:
-- SMS-AI v2 path hard-coded "Generated during phone call" into quotes.notes;
-- the literal string is wrong because the customer channel is SMS, not voice).
--
-- Nullable column with no DEFAULT — existing rows keep source=NULL per
-- operator-locked decision Q3 (no backfill). Render-time helper
-- buildQuoteNotesDisplay() in src/lib/quotes/source-labels.ts gracefully
-- falls back to rendering quotes.notes verbatim when source is NULL.

CREATE TYPE quote_source AS ENUM (
  'sms_agent',       -- SMS-AI v2 (send_quote_sms tool)
  'voice_agent',     -- ElevenLabs voice agent (direct + post-call finalize)
  'pos',             -- POS quote builder
  'admin',           -- Admin manual creation (API endpoint exists; no UI consumer today)
  'online_booking',  -- RESERVED — no consumer today; /api/book writes appointments, not quotes
  'twilio_legacy'    -- Legacy Twilio inbound auto-quote (SMS-AI v1)
);

ALTER TABLE quotes ADD COLUMN source quote_source NULL;

COMMENT ON COLUMN quotes.source IS
  'Channel of origin for this quote. Set automatically at creation time, '
  'immutable thereafter. Drives the auto-label shown above operator-edited '
  'notes on customer-facing quote views. NULL means the quote was created '
  'before this column existed (rendered with no label).';
