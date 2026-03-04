-- Add RLS SELECT policies for authenticated users on email template tables.
-- Admin client components (drip builder, automation editor) use createClient()
-- (browser Supabase) for lightweight reference data lookups. Without these
-- policies, queries return empty results because RLS blocks all access.
--
-- Write operations remain service-role only (via API routes + createAdminClient).

-- email_templates: authenticated users can read all templates
CREATE POLICY email_templates_select ON email_templates
  FOR SELECT TO authenticated USING (true);

-- email_layouts: authenticated users can read all layouts
CREATE POLICY email_layouts_select ON email_layouts
  FOR SELECT TO authenticated USING (true);

-- email_template_assignments: authenticated users can read assignments
CREATE POLICY email_template_assignments_select ON email_template_assignments
  FOR SELECT TO authenticated USING (true);

-- drip_sequences: authenticated users can read sequences
CREATE POLICY drip_sequences_select ON drip_sequences
  FOR SELECT TO authenticated USING (true);

-- drip_steps: authenticated users can read steps
CREATE POLICY drip_steps_select ON drip_steps
  FOR SELECT TO authenticated USING (true);

-- drip_enrollments: authenticated users can read enrollments
CREATE POLICY drip_enrollments_select ON drip_enrollments
  FOR SELECT TO authenticated USING (true);

-- drip_send_log: authenticated users can read send logs
CREATE POLICY drip_send_log_select ON drip_send_log
  FOR SELECT TO authenticated USING (true);
