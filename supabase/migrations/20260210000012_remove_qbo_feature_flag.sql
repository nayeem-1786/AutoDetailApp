-- Remove qbo_enabled from feature_flags table.
-- QBO sync toggle now lives exclusively in business_settings.
DELETE FROM feature_flags WHERE key = 'qbo_enabled';
