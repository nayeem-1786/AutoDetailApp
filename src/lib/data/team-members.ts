import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Team Members — Data Access Layer
// ---------------------------------------------------------------------------

export interface TeamMember {
  id: string;
  name: string;
  slug: string;
  role: string;
  bio: string | null;
  excerpt: string | null;
  photo_url: string | null;
  years_of_service: number | null;
  certifications: string[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Get all active team members (public-facing, sorted by sort_order).
 */
export const getActiveTeamMembers = cache(async (): Promise<TeamMember[]> => {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Failed to load active team members:', error);
    return [];
  }

  return (data ?? []).map(normalizeMember);
});

/**
 * Get a single team member by slug (public-facing).
 */
export const getTeamMemberBySlug = cache(async (slug: string): Promise<TeamMember | null> => {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return normalizeMember(data);
});

/**
 * Get all team members including inactive (admin).
 */
export const getAllTeamMembers = cache(async (): Promise<TeamMember[]> => {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Failed to load all team members:', error);
    return [];
  }

  return (data ?? []).map(normalizeMember);
});

/**
 * Get homepage team section heading from business_settings.
 * Falls back to "Meet the Team" if not set.
 */
export const getTeamSectionTitle = cache(async (): Promise<string> => {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', 'homepage_team_heading')
    .maybeSingle();

  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value);
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    } catch { /* fallback */ }
  }

  return 'Meet the Team';
});

/**
 * Get homepage credentials section heading from business_settings.
 * Falls back to "Credentials & Awards" if not set.
 */
export const getCredentialsSectionTitle = cache(async (): Promise<string> => {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', 'homepage_credentials_heading')
    .maybeSingle();

  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value);
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    } catch { /* fallback */ }
  }

  return 'Credentials & Awards';
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeMember(row: Record<string, unknown>): TeamMember {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    role: row.role as string,
    bio: (row.bio as string) || null,
    excerpt: (row.excerpt as string) || null,
    photo_url: (row.photo_url as string) || null,
    years_of_service: (row.years_of_service as number) ?? null,
    certifications: Array.isArray(row.certifications) ? row.certifications as string[] : [],
    sort_order: (row.sort_order as number) ?? 0,
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
