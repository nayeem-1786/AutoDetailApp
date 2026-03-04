// Dynamic gallery photo resolver for email templates
// Queries job_photos for matching before/after pairs at send time

import { createAdminClient } from '@/lib/supabase/admin';
import type { PhotoPair, PhotoGalleryBlockData } from './types';

interface ResolverContext {
  /** Service ID from the triggering event (job completion, etc.) */
  serviceId?: string;
  /** Customer ID for finding their past jobs */
  customerId?: string;
}

/**
 * Resolve dynamic photo_gallery blocks into concrete photo pairs.
 * For manual mode, pairs are already in block data — no resolution needed.
 * For dynamic mode, queries job_photos for matching featured pairs.
 */
export async function resolvePhotoPairs(
  data: PhotoGalleryBlockData,
  context: ResolverContext
): Promise<PhotoPair[]> {
  // Manual mode — pairs already specified
  if (data.mode === 'manual') {
    return data.pairs || [];
  }

  // Dynamic mode — query for matching photos
  const supabase = createAdminClient();
  const limit = data.limit || 2;

  // Start with featured photos that have both intake and completion phases
  // (zone-level before/after pairing)
  let query = supabase
    .from('job_photos')
    .select('id, job_id, zone, phase, image_url, tags, jobs!inner(id, customer_id, services)')
    .eq('is_featured', true)
    .eq('is_internal', false)
    .in('phase', ['intake', 'completion'])
    .order('created_at', { ascending: false });

  // Filter by customer if available
  if (context.customerId) {
    query = query.eq('jobs.customer_id', context.customerId);
  }

  // Filter by tags if specified
  if (data.tag_filter && data.tag_filter.length > 0) {
    query = query.overlaps('tags', data.tag_filter);
  }

  // Filter by zone if specified
  if (data.zone_filter) {
    query = query.eq('zone', data.zone_filter);
  }

  const { data: photos, error } = await query.limit(limit * 4); // Fetch extra to allow pairing

  if (error || !photos || photos.length === 0) {
    // Fallback: try any featured pair regardless of filters
    return resolveAnyFeaturedPairs(limit);
  }

  // Group photos by job_id + zone to find before/after pairs
  const pairMap = new Map<string, { before?: string; after?: string; caption?: string }>();

  for (const photo of photos) {
    const key = `${photo.job_id}:${photo.zone}`;
    if (!pairMap.has(key)) {
      pairMap.set(key, {});
    }
    const pair = pairMap.get(key)!;
    if (photo.phase === 'intake' && !pair.before) {
      pair.before = photo.image_url;
      pair.caption = photo.zone ? photo.zone.replace(/_/g, ' ') : undefined;
    } else if (photo.phase === 'completion' && !pair.after) {
      pair.after = photo.image_url;
    }
  }

  // Only include complete pairs (both before and after)
  const pairs: PhotoPair[] = [];
  for (const entry of pairMap.values()) {
    if (entry.before && entry.after) {
      pairs.push({
        before_url: entry.before,
        after_url: entry.after,
        caption: entry.caption,
      });
      if (pairs.length >= limit) break;
    }
  }

  // If no complete pairs found with filters, fallback to any featured
  if (pairs.length === 0) {
    return resolveAnyFeaturedPairs(limit);
  }

  return pairs;
}

/**
 * Fallback: get any featured before/after pairs from the gallery
 */
async function resolveAnyFeaturedPairs(limit: number): Promise<PhotoPair[]> {
  const supabase = createAdminClient();

  const { data: photos } = await supabase
    .from('job_photos')
    .select('id, job_id, zone, phase, image_url')
    .eq('is_featured', true)
    .eq('is_internal', false)
    .in('phase', ['intake', 'completion'])
    .order('created_at', { ascending: false })
    .limit(limit * 4);

  if (!photos || photos.length === 0) return [];

  const pairMap = new Map<string, { before?: string; after?: string; caption?: string }>();
  for (const photo of photos) {
    const key = `${photo.job_id}:${photo.zone}`;
    if (!pairMap.has(key)) pairMap.set(key, {});
    const pair = pairMap.get(key)!;
    if (photo.phase === 'intake' && !pair.before) {
      pair.before = photo.image_url;
      pair.caption = photo.zone ? photo.zone.replace(/_/g, ' ') : undefined;
    } else if (photo.phase === 'completion' && !pair.after) {
      pair.after = photo.image_url;
    }
  }

  const pairs: PhotoPair[] = [];
  for (const entry of pairMap.values()) {
    if (entry.before && entry.after) {
      pairs.push({ before_url: entry.before, after_url: entry.after, caption: entry.caption });
      if (pairs.length >= limit) break;
    }
  }

  return pairs;
}
