-- Add preview token support to website_pages for unpublished page previews
ALTER TABLE website_pages ADD COLUMN preview_token TEXT;
ALTER TABLE website_pages ADD COLUMN preview_token_expires_at TIMESTAMPTZ;
