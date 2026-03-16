-- Allow anon role to read feature flags (needed by POS which uses PIN auth, not Supabase Auth)
CREATE POLICY feature_flags_select_anon
  ON feature_flags FOR SELECT TO anon USING (true);
