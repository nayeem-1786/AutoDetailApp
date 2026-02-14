-- CMS Assets Storage Bucket

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cms-assets',
  'cms-assets',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'video/mp4']
)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "cms_assets_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'cms-assets');

-- Authenticated write access
CREATE POLICY "cms_assets_authenticated_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'cms-assets' AND auth.role() = 'authenticated');

CREATE POLICY "cms_assets_authenticated_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'cms-assets' AND auth.role() = 'authenticated');

CREATE POLICY "cms_assets_authenticated_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'cms-assets' AND auth.role() = 'authenticated');
