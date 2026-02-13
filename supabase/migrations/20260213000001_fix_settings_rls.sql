-- Allow admin role to write business_settings (previously super_admin only)
DROP POLICY IF EXISTS settings_write ON business_settings;

CREATE POLICY settings_write ON business_settings
  FOR ALL TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());
