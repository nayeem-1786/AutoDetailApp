-- Add image_url column to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url text;

-- Create service-images storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'service-images',
  'service-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Public read service images" ON storage.objects
  FOR SELECT USING (bucket_id = 'service-images');

-- Authenticated users can manage service images
CREATE POLICY "Auth users manage service images" ON storage.objects
  FOR ALL USING (bucket_id = 'service-images' AND auth.role() = 'authenticated');
