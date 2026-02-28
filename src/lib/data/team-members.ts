import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Team Members — Data Access Layer
// Replaces src/lib/data/team.ts (which read from business_settings JSON)
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

export interface CredentialItem {
  id: string;
  title: string;
  description: string;
  image_url: string;
  sort_order: number;
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
 * Get credentials from the About page's credentials content block.
 */
export const getCredentials = cache(async (): Promise<CredentialItem[]> => {
  const supabase = createAdminClient();

  // Find the About page
  const { data: page } = await supabase
    .from('website_pages')
    .select('id')
    .eq('slug', 'about')
    .eq('is_published', true)
    .maybeSingle();

  if (!page) return [];

  // Find the credentials content block on the About page
  const { data: block } = await supabase
    .from('page_content_blocks')
    .select('content')
    .eq('page_path', '/p/about')
    .eq('block_type', 'credentials')
    .eq('is_active', true)
    .maybeSingle();

  if (!block) return [];

  try {
    const parsed = JSON.parse(block.content);
    const credentials = Array.isArray(parsed) ? parsed : (parsed.credentials ?? []);
    return credentials
      .filter((c: CredentialItem) => c.title?.trim())
      .sort((a: CredentialItem, b: CredentialItem) => a.sort_order - b.sort_order);
  } catch {
    return [];
  }
});

/**
 * Get the team_grid block's title for use as the homepage section heading.
 * Falls back to "Meet the Team" if no title is set.
 */
export const getTeamSectionTitle = cache(async (): Promise<string> => {
  const supabase = createAdminClient();

  const { data: block } = await supabase
    .from('page_content_blocks')
    .select('title')
    .eq('page_path', '/p/about')
    .eq('block_type', 'team_grid')
    .eq('is_active', true)
    .maybeSingle();

  return block?.title?.trim() || 'Meet the Team';
});

/**
 * Get the credentials block's title for use as the homepage section heading.
 * Falls back to null (no separate heading rendered) if no title is set.
 */
export const getCredentialsSectionTitle = cache(async (): Promise<string | null> => {
  const supabase = createAdminClient();

  const { data: block } = await supabase
    .from('page_content_blocks')
    .select('title')
    .eq('page_path', '/p/about')
    .eq('block_type', 'credentials')
    .eq('is_active', true)
    .maybeSingle();

  return block?.title?.trim() || null;
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
