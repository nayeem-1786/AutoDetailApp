-- Add per-ticker message gap (space between repeated message copies in scroll mode)
ALTER TABLE announcement_tickers
  ADD COLUMN IF NOT EXISTS message_gap NUMERIC NOT NULL DEFAULT 5;

COMMENT ON COLUMN announcement_tickers.message_gap IS 'Space in rem between repeated message copies in scroll marquee. Default 5.';
