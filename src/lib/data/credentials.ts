import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Credential } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Credentials — Data Access Layer
// ---------------------------------------------------------------------------

/**
 * Get all active credentials (public-facing, sorted by sort_order).
 */
export const getActiveCredentials = cache(async (): Promise<Credential[]> => {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('credentials')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Failed to load active credentials:', error);
    return [];
  }

  return data ?? [];
});

/**
 * Get all credentials including inactive (admin).
 */
export const getAllCredentials = cache(async (): Promise<Credential[]> => {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('credentials')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Failed to load all credentials:', error);
    return [];
  }

  return data ?? [];
});
