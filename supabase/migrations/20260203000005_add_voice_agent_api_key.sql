INSERT INTO business_settings (key, value, description)
VALUES ('voice_agent_api_key', '"va_changeme_secret"', 'API key for 11 Labs Voice Agent integration')
ON CONFLICT (key) DO NOTHING;
