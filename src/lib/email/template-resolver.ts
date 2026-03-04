// Email template resolver — segment routing logic
// Given a trigger key and customer attributes, resolves the correct template

import { createAdminClient } from '@/lib/supabase/admin';
import type {
  EmailTemplate,
  EmailLayout,
  EmailTemplateAssignment,
  CustomerAttributes,
} from './types';

export interface ResolvedTemplate {
  template: EmailTemplate;
  layout: EmailLayout;
}

/**
 * Resolve the best email template for a given trigger key and customer attributes.
 *
 * Resolution order:
 * 1. Query email_template_assignments for matching trigger_key (active only)
 * 2. Sort by priority DESC
 * 3. Check each assignment's segment_filter against customer attributes
 * 4. First match wins; fall back to assignment with NULL segment_filter (default)
 * 5. If no assignments exist, fall back to template where template_key matches trigger_key
 * 6. Returns null if no template found
 */
export async function resolveEmailTemplate(
  triggerKey: string,
  customerAttributes?: CustomerAttributes
): Promise<ResolvedTemplate | null> {
  const supabase = createAdminClient();

  // Step 1: Check assignments
  const { data: assignments } = await supabase
    .from('email_template_assignments')
    .select(`
      id, trigger_key, template_id, segment_filter, priority, is_active,
      email_templates (
        id, template_key, category, name, subject, preview_text,
        layout_id, body_blocks, body_html, variables, segment_tag,
        is_system, is_customized, version, created_at, updated_at, updated_by
      )
    `)
    .eq('trigger_key', triggerKey)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (assignments && assignments.length > 0) {
    // Try segmented matches first (highest priority first)
    for (const assignment of assignments) {
      if (assignment.segment_filter && customerAttributes) {
        if (matchesSegmentFilter(assignment.segment_filter as Record<string, unknown>, customerAttributes)) {
          const template = assignment.email_templates as unknown as EmailTemplate;
          if (template) {
            const layout = await fetchLayout(template.layout_id);
            if (layout) return { template, layout };
          }
        }
      }
    }

    // Fall back to default assignment (no segment_filter)
    for (const assignment of assignments) {
      if (!assignment.segment_filter) {
        const template = assignment.email_templates as unknown as EmailTemplate;
        if (template) {
          const layout = await fetchLayout(template.layout_id);
          if (layout) return { template, layout };
        }
      }
    }
  }

  // Step 2: Fall back to template_key match
  const { data: fallbackTemplate } = await supabase
    .from('email_templates')
    .select('*')
    .eq('template_key', triggerKey)
    .is('segment_tag', null)
    .single();

  if (fallbackTemplate) {
    const template = fallbackTemplate as unknown as EmailTemplate;
    const layout = await fetchLayout(template.layout_id);
    if (layout) return { template, layout };
  }

  return null;
}

/**
 * Check if customer attributes match a segment filter.
 * Supports: vehicle_category, tags (any match), customer_type, min_lifetime_spend, min_visits
 */
function matchesSegmentFilter(
  filter: Record<string, unknown>,
  attributes: CustomerAttributes
): boolean {
  // Vehicle category match
  if (filter.vehicle_category && attributes.vehicle_category) {
    if (filter.vehicle_category !== attributes.vehicle_category) return false;
  }

  // Tag match (any tag in filter matches any tag on customer)
  if (filter.tags && Array.isArray(filter.tags) && attributes.tags) {
    const filterTags = filter.tags as string[];
    const hasMatch = filterTags.some(t => attributes.tags!.includes(t));
    if (!hasMatch) return false;
  }

  // Customer type match
  if (filter.customer_type && attributes.customer_type) {
    if (filter.customer_type !== attributes.customer_type) return false;
  }

  // Minimum lifetime spend
  if (typeof filter.min_lifetime_spend === 'number' && typeof attributes.lifetime_spend === 'number') {
    if (attributes.lifetime_spend < filter.min_lifetime_spend) return false;
  }

  // Minimum visits
  if (typeof filter.min_visits === 'number' && typeof attributes.visit_count === 'number') {
    if (attributes.visit_count < filter.min_visits) return false;
  }

  return true;
}

/**
 * Fetch an email layout by ID
 */
async function fetchLayout(layoutId: string): Promise<EmailLayout | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('email_layouts')
    .select('*')
    .eq('id', layoutId)
    .single();

  return data as unknown as EmailLayout | null;
}

/**
 * Fetch the default email layout
 */
export async function fetchDefaultLayout(): Promise<EmailLayout | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('email_layouts')
    .select('*')
    .eq('is_default', true)
    .single();

  return data as unknown as EmailLayout | null;
}

/**
 * Fetch a layout by slug
 */
export async function fetchLayoutBySlug(slug: string): Promise<EmailLayout | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('email_layouts')
    .select('*')
    .eq('slug', slug)
    .single();

  return data as unknown as EmailLayout | null;
}
