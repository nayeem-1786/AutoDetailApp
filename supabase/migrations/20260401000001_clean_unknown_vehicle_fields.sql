-- One-time cleanup: strip "Unknown" values from vehicle fields
-- These were stored by prior Gemini LLM testing on the ElevenLabs voice agent

UPDATE vehicles SET color = NULL WHERE LOWER(color) = 'unknown';
UPDATE vehicles SET make = NULL WHERE LOWER(make) = 'unknown';
UPDATE vehicles SET model = NULL WHERE LOWER(model) = 'unknown';
UPDATE vehicles SET year = NULL WHERE LOWER(year::text) = 'unknown';
