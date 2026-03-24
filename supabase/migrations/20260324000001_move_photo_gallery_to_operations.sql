-- Move photo_gallery from Future to Operations category
-- It's an active feature (gates the public gallery page), not a future placeholder
UPDATE feature_flags SET
  category = 'Operations'
WHERE key = 'photo_gallery';
