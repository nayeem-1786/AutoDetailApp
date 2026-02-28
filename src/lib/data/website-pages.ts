import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo } from '@/lib/data/business';
import { getActiveCities } from '@/lib/data/cities';
import type {
  WebsitePage,
  WebsiteNavItem,
  NavPlacement,
  FooterSection,
  FooterColumn,
  FooterBottomLink,
  FooterData,
} from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Navigation — Public (cached across requests, revalidated on admin write)
// ---------------------------------------------------------------------------

export const getNavigationItems = unstable_cache(
  async (placement: NavPlacement): Promise<WebsiteNavItem[]> => {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('website_navigation')
      .select('*')
      .eq('placement', placement)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Failed to load navigation items:', error);
      return [];
    }

    return buildNavTree(data as WebsiteNavItem[]);
  },
  ['nav-items'],
  { revalidate: 60, tags: ['cms-navigation'] }
);

/**
 * Fetch ALL navigation items for a placement (admin, includes inactive).
 */
export async function getAllNavigationItems(
  placement: NavPlacement
): Promise<WebsiteNavItem[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('website_navigation')
    .select('*')
    .eq('placement', placement)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Failed to load navigation items (admin):', error);
    return [];
  }

  return data as WebsiteNavItem[];
}

// ---------------------------------------------------------------------------
// Pages — Public (cached across requests)
// ---------------------------------------------------------------------------

export const getPageBySlug = unstable_cache(
  async (slug: string): Promise<WebsitePage | null> => {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('website_pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();

    if (error) {
      console.error('Failed to load page by slug:', error);
      return null;
    }

    return data as WebsitePage | null;
  },
  ['page-by-slug'],
  { revalidate: 300, tags: ['cms-pages'] }
);

/**
 * Fetch a page by slug without the published filter (for preview mode).
 * Not cached — preview should always reflect latest state.
 */
export async function getPageBySlugForPreview(slug: string): Promise<WebsitePage | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('website_pages')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('Failed to load page by slug (preview):', error);
    return null;
  }

  return data as WebsitePage | null;
}

/**
 * Fetch all published pages (for sitemap).
 */
export const getPublishedPages = unstable_cache(
  async (): Promise<WebsitePage[]> => {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('website_pages')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Failed to load published pages:', error);
      return [];
    }

    return data as WebsitePage[];
  },
  ['published-pages'],
  { revalidate: 300, tags: ['cms-pages'] }
);

/**
 * Fetch all pages (admin) as a flat list.
 */
export async function getAllPages(): Promise<WebsitePage[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('website_pages')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Failed to load all pages (admin):', error);
    return [];
  }

  return data as WebsitePage[];
}

// ---------------------------------------------------------------------------
// Footer — Public (cached, revalidated on admin write)
// ---------------------------------------------------------------------------

export const getFooterData = unstable_cache(
  async (): Promise<FooterData> => {
    const supabase = createAdminClient();

    // Fetch all 3 sections
    const { data: sections } = await supabase
      .from('footer_sections')
      .select('*')
      .order('sort_order', { ascending: true });

    // Fetch enabled columns for main footer
    const { data: columns } = await supabase
      .from('footer_columns')
      .select('*')
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true });

    // Fetch nav links assigned to footer columns
    const { data: navLinks } = await supabase
      .from('website_navigation')
      .select('*')
      .not('footer_column_id', 'is', null)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    // Attach links to their columns
    const columnsWithLinks: FooterColumn[] = (columns ?? []).map((col) => ({
      ...(col as FooterColumn),
      links:
        col.content_type === 'links'
          ? ((navLinks ?? []) as WebsiteNavItem[]).filter(
              (link) => link.footer_column_id === col.id
            )
          : [],
    }));

    // Fetch bottom bar links
    const { data: bottomLinks } = await supabase
      .from('footer_bottom_links')
      .select('*')
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true });

    // Reuse existing data functions
    const [cities, businessInfo] = await Promise.all([
      getActiveCities(),
      getBusinessInfo(),
    ]);

    return {
      sections: (sections ?? []) as FooterSection[],
      columns: columnsWithLinks,
      bottomLinks: (bottomLinks ?? []) as FooterBottomLink[],
      cities: cities.map((c) => ({ id: c.id, slug: c.slug, city_name: c.city_name })),
      businessInfo,
    };
  },
  ['footer-data'],
  { revalidate: 60, tags: ['footer-data'] }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildNavTree(items: WebsiteNavItem[]): WebsiteNavItem[] {
  const map = new Map<string, WebsiteNavItem>();
  const roots: WebsiteNavItem[] = [];

  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }

  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
