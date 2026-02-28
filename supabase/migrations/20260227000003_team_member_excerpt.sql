-- Add excerpt column to team_members for homepage short summary
ALTER TABLE team_members ADD COLUMN excerpt TEXT;
COMMENT ON COLUMN team_members.excerpt IS 'Short 1-2 line summary for homepage display';
