import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { revalidateTag } from '@/lib/utils/revalidate';

// ---------------------------------------------------------------------------
// POST /api/admin/cms/migrate-data
// One-time migration: About + Terms data from business_settings → Pages system
// Idempotent — safe to run multiple times
// ---------------------------------------------------------------------------

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function wrapInParagraphs(text: string): string {
  if (!text) return '';
  // If already HTML, return as-is
  if (text.trim().startsWith('<')) return text;
  // Split on double newlines and wrap each in <p>
  return text
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export async function POST() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const admin = createAdminClient();
  const results: string[] = [];

  // =========================================================================
  // 1. ABOUT PAGE MIGRATION
  // =========================================================================

  // Check if About page already exists
  const { data: existingAbout } = await admin
    .from('website_pages')
    .select('id')
    .eq('slug', 'about')
    .maybeSingle();

  if (existingAbout) {
    results.push('About page already exists — skipped page creation');
  } else {
    // Fetch about_text from business_settings
    const { data: aboutSetting } = await admin
      .from('business_settings')
      .select('value')
      .eq('key', 'about_text')
      .maybeSingle();

    const aboutText = (aboutSetting?.value as string) || '';
    const aboutHtml = wrapInParagraphs(aboutText);

    // Auto-calculate sort_order
    const { data: existingPages } = await admin
      .from('website_pages')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);

    const sortOrder = existingPages && existingPages.length > 0 ? existingPages[0].sort_order + 1 : 0;

    const { error: pageErr } = await admin
      .from('website_pages')
      .insert({
        title: 'About Us',
        slug: 'about',
        page_template: 'content',
        is_published: true,
        show_in_nav: false,
        content: aboutHtml,
        sort_order: sortOrder,
      });

    if (pageErr) {
      return NextResponse.json({ error: `Failed to create About page: ${pageErr.message}` }, { status: 500 });
    }
    results.push('About page created in website_pages');
  }

  // ---------- Migrate team members to team_members table ----------

  const { data: teamSetting } = await admin
    .from('business_settings')
    .select('value')
    .eq('key', 'team_members')
    .maybeSingle();

  // Check if team members already migrated
  const { data: existingMembers } = await admin
    .from('team_members')
    .select('id')
    .limit(1);

  if (existingMembers && existingMembers.length > 0) {
    results.push('Team members already exist in table — skipped');
  } else if (teamSetting?.value) {
    let rawMembers: Array<Record<string, unknown>> = [];
    if (Array.isArray(teamSetting.value)) {
      rawMembers = teamSetting.value as Array<Record<string, unknown>>;
    } else if (typeof teamSetting.value === 'string') {
      try {
        rawMembers = JSON.parse(teamSetting.value);
      } catch { /* skip */ }
    }

    if (rawMembers.length > 0) {
      const memberRows = rawMembers.map((m, i) => {
        const name = (m.name as string) || '';
        let slug = toSlug(name);
        if (!slug) slug = `member-${i}`;

        return {
          name,
          slug,
          role: (m.role as string) || '',
          bio: (m.bio as string) || null,
          // Handle both camelCase (photoUrl) and snake_case (photo_url)
          photo_url: (m.photoUrl as string) || (m.photo_url as string) || null,
          years_of_service: null,
          certifications: [],
          sort_order: i,
          is_active: true,
        };
      });

      // Ensure slug uniqueness within batch
      const seenSlugs = new Set<string>();
      for (const row of memberRows) {
        if (seenSlugs.has(row.slug)) {
          row.slug = `${row.slug}-${Date.now().toString(36)}`;
        }
        seenSlugs.add(row.slug);
      }

      const { error: membersErr } = await admin
        .from('team_members')
        .insert(memberRows);

      if (membersErr) {
        results.push(`Failed to migrate team members: ${membersErr.message}`);
      } else {
        results.push(`Migrated ${memberRows.length} team members to team_members table`);
      }
    } else {
      results.push('No team members found in business_settings');
    }
  } else {
    results.push('No team_members key in business_settings');
  }

  // ---------- Create team_grid content block on About page ----------

  const { data: aboutPage } = await admin
    .from('website_pages')
    .select('id')
    .eq('slug', 'about')
    .maybeSingle();

  if (aboutPage) {
    const pagePath = '/p/about';

    // Check if team_grid block already exists
    const { data: existingTeamBlock } = await admin
      .from('page_content_blocks')
      .select('id')
      .eq('page_path', pagePath)
      .eq('block_type', 'team_grid')
      .maybeSingle();

    if (existingTeamBlock) {
      results.push('team_grid block already exists on About page — skipped');
    } else {
      const { error: blockErr } = await admin
        .from('page_content_blocks')
        .insert({
          page_path: pagePath,
          page_type: 'page',
          block_type: 'team_grid',
          title: 'Meet the Team',
          content: JSON.stringify({ source: 'team_members_table' }),
          sort_order: 1,
          is_active: true,
        });

      if (blockErr) {
        results.push(`Failed to create team_grid block: ${blockErr.message}`);
      } else {
        results.push('Created team_grid content block on About page');
      }
    }

    // ---------- Migrate credentials to content block ----------

    const { data: existingCredBlock } = await admin
      .from('page_content_blocks')
      .select('id')
      .eq('page_path', pagePath)
      .eq('block_type', 'credentials')
      .maybeSingle();

    if (existingCredBlock) {
      results.push('credentials block already exists on About page — skipped');
    } else {
      const { data: credSetting } = await admin
        .from('business_settings')
        .select('value')
        .eq('key', 'credentials')
        .maybeSingle();

      let credentials: Array<Record<string, unknown>> = [];
      if (credSetting?.value) {
        if (Array.isArray(credSetting.value)) {
          credentials = credSetting.value as Array<Record<string, unknown>>;
        } else if (typeof credSetting.value === 'string') {
          try { credentials = JSON.parse(credSetting.value); } catch { /* skip */ }
        }
      }

      const credentialsData = credentials.map((c, i) => ({
        id: crypto.randomUUID(),
        title: (c.title as string) || '',
        description: (c.description as string) || '',
        // Handle both camelCase (imageUrl) and snake_case (image_url)
        image_url: (c.imageUrl as string) || (c.image_url as string) || '',
        sort_order: i,
      }));

      const { error: credBlockErr } = await admin
        .from('page_content_blocks')
        .insert({
          page_path: pagePath,
          page_type: 'page',
          block_type: 'credentials',
          title: 'Credentials & Awards',
          content: JSON.stringify(credentialsData),
          sort_order: 2,
          is_active: true,
        });

      if (credBlockErr) {
        results.push(`Failed to create credentials block: ${credBlockErr.message}`);
      } else {
        results.push(`Created credentials block with ${credentialsData.length} credentials`);
      }
    }
  }

  // =========================================================================
  // 2. TERMS PAGE MIGRATION
  // =========================================================================

  const { data: existingTerms } = await admin
    .from('website_pages')
    .select('id')
    .eq('slug', 'terms')
    .maybeSingle();

  if (existingTerms) {
    results.push('Terms page already exists — skipped page creation');
  } else {
    const { data: existingPages2 } = await admin
      .from('website_pages')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);

    const sortOrder2 = existingPages2 && existingPages2.length > 0 ? existingPages2[0].sort_order + 1 : 0;

    const { error: termsPageErr } = await admin
      .from('website_pages')
      .insert({
        title: 'Terms & Conditions',
        slug: 'terms',
        page_template: 'content',
        is_published: true,
        show_in_nav: false,
        content: '',
        sort_order: sortOrder2,
      });

    if (termsPageErr) {
      return NextResponse.json({ error: `Failed to create Terms page: ${termsPageErr.message}` }, { status: 500 });
    }
    results.push('Terms page created in website_pages');
  }

  // ---------- Migrate terms sections to content block ----------

  const termsPagePath = '/p/terms';

  const { data: existingTermsBlock } = await admin
    .from('page_content_blocks')
    .select('id')
    .eq('page_path', termsPagePath)
    .eq('block_type', 'terms_sections')
    .maybeSingle();

  if (existingTermsBlock) {
    results.push('terms_sections block already exists on Terms page — skipped');
  } else {
    // Fetch from business_settings
    const { data: termsSettings } = await admin
      .from('business_settings')
      .select('key, value')
      .in('key', ['terms_and_conditions', 'terms_effective_date']);

    const settingsMap: Record<string, unknown> = {};
    for (const row of termsSettings ?? []) {
      settingsMap[row.key] = row.value;
    }

    let termsSections: Array<Record<string, unknown>> = [];
    const rawTerms = settingsMap.terms_and_conditions;
    if (Array.isArray(rawTerms)) {
      termsSections = rawTerms as Array<Record<string, unknown>>;
    } else if (typeof rawTerms === 'string') {
      try { termsSections = JSON.parse(rawTerms); } catch { /* skip */ }
    }

    // If no custom terms exist, seed with defaults
    if (termsSections.length === 0) {
      termsSections = getDefaultTermsSections();
    }

    const effectiveDate = (settingsMap.terms_effective_date as string) || null;

    const sectionsData = termsSections.map((s, i) => ({
      id: crypto.randomUUID(),
      title: (s.title as string) || '',
      content: wrapInParagraphs((s.content as string) || ''),
      is_active: s.is_active !== false,
      sort_order: i,
    }));

    const blockContent = {
      effective_date: effectiveDate,
      sections: sectionsData,
    };

    const { error: termsBlockErr } = await admin
      .from('page_content_blocks')
      .insert({
        page_path: termsPagePath,
        page_type: 'page',
        block_type: 'terms_sections',
        title: 'Terms & Conditions',
        content: JSON.stringify(blockContent),
        sort_order: 0,
        is_active: true,
      });

    if (termsBlockErr) {
      results.push(`Failed to create terms_sections block: ${termsBlockErr.message}`);
    } else {
      results.push(`Created terms_sections block with ${sectionsData.length} sections`);
    }
  }

  // Revalidate all caches
  revalidateTag('cms-pages');
  revalidateTag('cms-content');
  revalidateTag('team-members');

  return NextResponse.json({ success: true, results });
}

// ---------------------------------------------------------------------------
// Default Terms Sections (from existing src/app/(public)/terms/page.tsx)
// ---------------------------------------------------------------------------

function getDefaultTermsSections(): Array<Record<string, unknown>> {
  return [
    {
      title: 'Service Agreement & Liability',
      content:
        'We exercise professional care during all services. However, we are not responsible for pre-existing scratches, swirl marks, paint chips, or clear coat failure. Items left in vehicles are not our responsibility. Vehicle condition is documented via photo inspection at intake. Claims must be reported within 24 hours of service completion with supporting evidence.',
      is_active: true,
    },
    {
      title: 'Payment Terms',
      content:
        'Payment is due upon completion of service. We accept cash, credit/debit cards, and checks. Deposits for ceramic coating services are non-refundable.',
      is_active: true,
    },
    {
      title: 'Cancellation & No-Show Policy',
      content:
        '24-hour notice is required for cancellation without fee. Late cancellations and no-shows may be charged a cancellation fee. Repeated no-shows may require a deposit for future bookings.',
      is_active: true,
    },
    {
      title: 'SMS & Text Message Consent',
      content:
        'By providing your phone number, you consent to receive service-related messages (appointment confirmations, reminders, completion notifications). Marketing messages (promotions, special offers) are optional. Message and data rates may apply. Message frequency varies. Reply STOP to opt out of marketing messages at any time. Reply HELP for assistance. Opting out of marketing does not affect service-related messages.',
      is_active: true,
    },
    {
      title: 'Email Communications',
      content:
        'By providing your email, you may receive transactional emails (booking confirmations, receipts, quote notifications). Marketing emails (promotions, newsletters) require separate opt-in. An unsubscribe link is provided in every marketing email.',
      is_active: true,
    },
    {
      title: 'Photo Documentation & Usage',
      content:
        'Service photos are taken for quality documentation purposes. Photos may be used for marketing (website gallery, social media) unless you opt out. Internal-only photos are never shared publicly. You may request photo removal at any time.',
      is_active: true,
    },
    {
      title: 'Warranty & Service Guarantees',
      content:
        'Ceramic coating warranty terms vary by product tier (1-year, 3-year, 5-year). Warranty requires adherence to the recommended maintenance schedule. Warranty is void if the vehicle is subjected to improper washing, chemical damage, physical damage, or unauthorized touch-ups. Standard services include a satisfaction guarantee within 24 hours.',
      is_active: true,
    },
    {
      title: 'Mobile / On-Location Service',
      content:
        'For mobile services, you must provide adequate workspace (shade preferred, flat surface). Water and electrical access may be required for certain services. You are responsible for ensuring the location is safe and accessible. We reserve the right to refuse service if the location is deemed unsafe or inadequate.',
      is_active: true,
    },
    {
      title: 'General Terms',
      content:
        'We reserve the right to refuse service. Pricing is subject to change without notice. Service estimates are approximations — the final price may vary based on vehicle condition. These terms are governed by the laws of the State of California.',
      is_active: true,
    },
  ];
}
