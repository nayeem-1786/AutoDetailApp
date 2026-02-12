-- =============================================================================
-- Phase 8 Session 2: Create job-photos storage bucket
-- Public read, authenticated write — same pattern as product-images and service-images
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-photos',
  'job-photos',
  true,
  10485760, -- 10MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access (needed for SMS MMS, email embeds, public gallery)
CREATE POLICY "job_photos_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'job-photos');

-- Allow authenticated users to upload
CREATE POLICY "job_photos_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-photos');

-- Allow authenticated users to update their uploads
CREATE POLICY "job_photos_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'job-photos');

-- Allow authenticated users to delete
CREATE POLICY "job_photos_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'job-photos');
