import { createAdminClient } from '@/lib/supabase/admin';
import type { ContentBlockType } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// AI Content Writer — Claude API wrapper for page content generation
// Reuses ANTHROPIC_API_KEY from messaging/SEO integration
// ---------------------------------------------------------------------------

export interface ServiceHighlight {
  id: string;
  service_name: string;
  description: string;
  is_featured: boolean;
}

export interface ContentWriterContext {
  pagePath: string;
  pageType: string;
  businessName: string;
  businessLocation: string;
  businessPhone: string;
  googleRating: string;
  googleReviewCount: string;

  // Page-specific context
  cityName?: string;
  cityDistance?: string;
  localLandmarks?: string;
  serviceHighlights?: ServiceHighlight[];
  serviceName?: string;
  serviceCategory?: string;
  serviceDescription?: string;
  servicePrice?: string;
  productName?: string;
  productDescription?: string;

  // Generic page context (for non-city, non-service pages)
  pageContext?: {
    title?: string;
    metaDescription?: string;
    existingContent?: string;
  };

  // What to generate
  contentType: 'full_page' | 'section' | 'faq' | 'intro_paragraph' | 'service_description' | 'improve';
  blockType?: ContentBlockType;
  targetWordCount?: number;
  focusKeywords?: string[];
  existingContent?: string;
  additionalInstructions?: string;
}

export interface ContentWriterBlock {
  block_type: ContentBlockType;
  title: string | null;
  content: string;
  sort_order: number;
}

export interface ContentWriterResult {
  blocks: ContentWriterBlock[];
  seoNotes: string[];
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const CONTENT_WRITER_SYSTEM_PROMPT = `You are a professional copywriter and SEO expert with 10 years of experience writing content for local service businesses, specifically auto detailing and automotive care. You write compelling, conversion-focused content that naturally incorporates local keywords, builds trust through social proof, and drives bookings.

WRITING GUIDELINES:
- Write in a professional but approachable tone — premium but not stuffy
- Naturally incorporate focus keywords without keyword stuffing
- For city pages: mention the city name 3-5 times naturally, reference local neighborhoods, emphasize mobile service convenience
- Include trust signals (Google rating, years of experience, certifications like Ceramic Pro)
- End sections with subtle CTAs driving toward booking
- Use short paragraphs (2-3 sentences) for mobile readability
- Use proper HTML heading tags (<h2>, <h3>) for SEO structure
- For FAQ blocks: write 5-8 questions real customers would ask, with detailed answers
- For feature lists: focus on benefits, not just features
- All content must be unique per page — no duplicate content across city pages
- Return content as well-formatted HTML using <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em> tags. Do NOT use markdown syntax (no ##, no **, no - lists).

BLOCK TYPE RULES:
- "rich_text": Write HTML paragraphs with headings. Use <h2> for section titles, <h3> for subsections, <p> for paragraphs, <ul>/<li> for lists, <strong> and <em> for emphasis.
- "faq": Return a JSON array of objects with "question" and "answer" keys. Answers should be 2-4 sentences.
- "features_list": Return a JSON array of objects with "title" and "description" keys.
- "cta": Return a JSON object with "heading", "description", "button_text", and "button_url" keys.
- "testimonial_highlight": Return a JSON object with "quote", "author", "rating", and "source" keys.
- "team_grid": Return a JSON array of objects with "name", "role", "bio", and optional "photo_url" and "badges" (string array) keys.
- "credentials": Return a JSON array of objects with "title", "description", and optional "image_url" keys.
- "terms_sections": Return a JSON array of objects with "heading", "body" (HTML string), "is_active" (boolean), and "sort_order" (number) keys.
- "gallery": Return a JSON array of objects with "image_url", "alt_text", and optional "caption" keys.

LOCAL SEO CONTEXT:
- Business serves the South Bay / Los Angeles area
- Ceramic Pro certified installer
- Mobile service available — we come to you
- Premium products and professional techniques
- 5-star Google reviews

RESPONSE FORMAT:
Return ONLY valid JSON matching this structure, with no additional text:
{
  "blocks": [
    {
      "block_type": "rich_text",
      "title": "Section Title or null",
      "content": "Markdown content here...",
      "sort_order": 0
    }
  ],
  "seoNotes": ["Actionable SEO suggestion 1", "Suggestion 2"]
}

For rich_text blocks, "content" is HTML text (using <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em> tags — NOT markdown).
For faq, features_list, cta, testimonial_highlight blocks, "content" is a JSON string (stringified JSON).`;

// ---------------------------------------------------------------------------
// Core API call
// ---------------------------------------------------------------------------

async function callClaudeForContent(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4000
): Promise<ContentWriterResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('AI content generation failed:', error);
    throw new Error(`AI content generation failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;

  if (!text) {
    throw new Error('Empty AI content response');
  }

  // Parse JSON response — handle potential markdown code fences
  const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    const result = JSON.parse(jsonStr) as ContentWriterResult;
    if (!result.blocks || !Array.isArray(result.blocks)) {
      throw new Error('AI returned invalid content structure');
    }
    return result;
  } catch {
    console.error('Failed to parse AI content response:', text);
    throw new Error('AI returned invalid JSON for content');
  }
}

// ---------------------------------------------------------------------------
// Build business context from DB
// ---------------------------------------------------------------------------

export async function getBusinessContext(): Promise<{
  businessName: string;
  businessLocation: string;
  businessPhone: string;
  googleRating: string;
  googleReviewCount: string;
}> {
  const admin = createAdminClient();

  const { data: settings } = await admin
    .from('business_settings')
    .select('key, value')
    .in('key', [
      'business_name',
      'business_phone',
      'business_address',
      'google_review_rating',
      'google_review_count',
    ]);

  const s: Record<string, unknown> = {};
  for (const row of settings ?? []) s[row.key] = row.value;

  const addr =
    typeof s.business_address === 'object' && s.business_address !== null
      ? (s.business_address as { city: string; state: string })
      : { city: 'Lomita', state: 'CA' };

  return {
    businessName: (s.business_name as string) || 'Smart Detail Auto Spa & Supplies',
    businessLocation: `${addr.city}, ${addr.state}`,
    businessPhone: (s.business_phone as string) || '',
    googleRating: (s.google_review_rating as string) || '5.0',
    googleReviewCount: (s.google_review_count as string) || '44',
  };
}

// ---------------------------------------------------------------------------
// City page content generation
// ---------------------------------------------------------------------------

function buildCityPagePrompt(ctx: ContentWriterContext): string {
  const featured = ctx.serviceHighlights?.filter((s) => s.is_featured) ?? [];
  const allHighlights = ctx.serviceHighlights ?? [];

  const parts = [
    `Generate FULL PAGE CONTENT for a city landing page.`,
    '',
    `PAGE: ${ctx.pagePath}`,
    `CITY: ${ctx.cityName || 'Unknown City'}`,
    `BUSINESS: ${ctx.businessName}`,
    `BUSINESS LOCATION: ${ctx.businessLocation}`,
    `BUSINESS PHONE: ${ctx.businessPhone}`,
    `GOOGLE RATING: ${ctx.googleRating} stars (${ctx.googleReviewCount} reviews)`,
    ctx.cityDistance ? `DISTANCE FROM SHOP: ${ctx.cityDistance}` : '',
  ];

  // Inject city-specific SEO context
  if (ctx.focusKeywords?.length) {
    parts.push(`FOCUS KEYWORDS (must be naturally incorporated throughout): ${ctx.focusKeywords.join(', ')}`);
  }
  if (ctx.localLandmarks) {
    parts.push(`LOCAL LANDMARKS & POINTS OF INTEREST: ${ctx.localLandmarks}`);
  }
  if (featured.length > 0) {
    parts.push(`FEATURED SERVICES FOR THIS CITY: ${featured.map((s) => s.service_name).join(', ')}`);
  }
  if (allHighlights.length > 0) {
    const descriptions = allHighlights
      .filter((s) => s.description)
      .map((s) => `  - ${s.service_name}: ${s.description}`);
    if (descriptions.length > 0) {
      parts.push(`SERVICE CONTEXT FOR THIS CITY:`);
      parts.push(...descriptions);
    }
  }

  parts.push(
    '',
    `Generate these blocks IN ORDER:`,
    `1. "rich_text" — City-specific intro paragraph mentioning ${ctx.cityName}, distance, and local context. ${ctx.localLandmarks ? `Reference landmarks like ${ctx.localLandmarks.split(',').slice(0, 2).join(' and ')}.` : ''} (150-200 words)`,
    `2. "rich_text" — "Why Choose ${ctx.businessName} in ${ctx.cityName}" — mobile service convenience, certifications, local knowledge${featured.length > 0 ? `, emphasize ${featured.map((s) => s.service_name).join(', ')}` : ''} (200-300 words)`,
    `3. "features_list" — "Popular Services in ${ctx.cityName}" — ${allHighlights.length > 0 ? `Use these services: ${allHighlights.map((s) => s.service_name).join(', ')}. Include city-specific descriptions.` : 'Top 4-5 services with benefit-focused descriptions.'} (JSON array of {title, description})`,
    `4. "rich_text" — "The Smart Details Difference" — Differentiators, quality commitment, premium products${ctx.localLandmarks ? `, reference serving near ${ctx.localLandmarks.split(',')[0]?.trim()}` : ''} (150-250 words)`,
    `5. "faq" — 6-8 city-specific FAQ questions real customers in ${ctx.cityName} would ask, with detailed answers (JSON array of {question, answer})`,
    `6. "cta" — Booking CTA: "Ready for Premium Detailing in ${ctx.cityName}?" (JSON object with heading, description, button_text, button_url="/book")`,
    '',
    `CRITICAL REQUIREMENTS:`,
    `- Each section must have UNIQUE content specific to ${ctx.cityName}. DO NOT use generic content that could apply to any city.`,
  );

  if (ctx.focusKeywords?.length) {
    parts.push(`- Naturally incorporate EACH focus keyword at least 2-3 times across all blocks: ${ctx.focusKeywords.join(', ')}`);
  }
  if (ctx.localLandmarks) {
    parts.push(`- Reference local landmarks to build geographic relevance`);
  }
  if (featured.length > 0) {
    parts.push(`- Give prominent attention to featured services: ${featured.map((s) => s.service_name).join(', ')}`);
  }

  if (ctx.additionalInstructions) {
    parts.push('', `ADDITIONAL INSTRUCTIONS: ${ctx.additionalInstructions}`);
  }

  return parts.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Service page content generation
// ---------------------------------------------------------------------------

function buildServicePagePrompt(ctx: ContentWriterContext): string {
  const parts = [
    `Generate content for a service detail page.`,
    '',
    `PAGE: ${ctx.pagePath}`,
    `SERVICE: ${ctx.serviceName || 'Unknown Service'}`,
    `CATEGORY: ${ctx.serviceCategory || ''}`,
    `DESCRIPTION: ${ctx.serviceDescription || ''}`,
    `PRICING: ${ctx.servicePrice || 'Contact for pricing'}`,
    `BUSINESS: ${ctx.businessName}`,
    `LOCATION: ${ctx.businessLocation}`,
    `PHONE: ${ctx.businessPhone}`,
    `GOOGLE RATING: ${ctx.googleRating} stars (${ctx.googleReviewCount} reviews)`,
    ctx.focusKeywords?.length ? `FOCUS KEYWORDS: ${ctx.focusKeywords.join(', ')}` : '',
    '',
    `Generate these blocks IN ORDER:`,
    `1. "rich_text" — Detailed service description (250-400 words). Explain what it is, why customers need it, and what results to expect.`,
    `2. "features_list" — 4-6 key benefits of this service (JSON array of {title, description})`,
    `3. "faq" — 4-6 common questions about this service with answers (JSON array of {question, answer})`,
    `4. "cta" — Booking CTA for this service (JSON object with heading, description, button_text, button_url="/book")`,
  ];

  if (ctx.additionalInstructions) {
    parts.push('', `ADDITIONAL INSTRUCTIONS: ${ctx.additionalInstructions}`);
  }

  return parts.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Single block generation
// ---------------------------------------------------------------------------

function buildSingleBlockPrompt(ctx: ContentWriterContext): string {
  const typeLabel = ctx.blockType || 'rich_text';
  const parts = [
    `Generate a single "${typeLabel}" content block.`,
    '',
    `PAGE: ${ctx.pagePath}`,
    `PAGE TYPE: ${ctx.pageType}`,
    `BUSINESS: ${ctx.businessName}`,
    `LOCATION: ${ctx.businessLocation}`,
    ctx.cityName ? `CITY: ${ctx.cityName}` : '',
    ctx.serviceName ? `SERVICE: ${ctx.serviceName}` : '',
    ctx.focusKeywords?.length ? `FOCUS KEYWORDS: ${ctx.focusKeywords.join(', ')}` : '',
    ctx.targetWordCount ? `TARGET WORD COUNT: ${ctx.targetWordCount}` : '',
  ];

  // Inject city-specific context
  if (ctx.cityName) {
    if (ctx.cityDistance) parts.push(`DISTANCE FROM SHOP: ${ctx.cityDistance}`);
    if (ctx.localLandmarks) parts.push(`LOCAL LANDMARKS: ${ctx.localLandmarks}`);
    const featured = ctx.serviceHighlights?.filter((s) => s.is_featured) ?? [];
    if (featured.length > 0) {
      parts.push(`FEATURED SERVICES: ${featured.map((s) => s.service_name).join(', ')}`);
    }
    if (ctx.serviceHighlights && ctx.serviceHighlights.length > 0) {
      const descriptions = ctx.serviceHighlights
        .filter((s) => s.description)
        .map((s) => `  - ${s.service_name}: ${s.description}`);
      if (descriptions.length > 0) {
        parts.push(`SERVICE CONTEXT:`, ...descriptions);
      }
    }
  }

  // Inject page context for non-city, non-service pages
  if (!ctx.cityName && !ctx.serviceName && ctx.pageContext) {
    if (ctx.pageContext.title) {
      parts.push(`PAGE TITLE: ${ctx.pageContext.title}`);
    }
    if (ctx.pageContext.metaDescription) {
      parts.push(`PAGE DESCRIPTION: ${ctx.pageContext.metaDescription}`);
    }
    if (ctx.pageContext.existingContent) {
      parts.push(`EXISTING CONTENT ON THIS PAGE: ${ctx.pageContext.existingContent}`);
    }
    parts.push('', `Generate content relevant to the page topic "${ctx.pageContext.title || 'this page'}". Write complementary content that adds value to the existing page.`);
  }

  if (typeLabel === 'faq') {
    parts.push('', 'Generate 5-8 Q&A pairs as a JSON array of {question, answer}.');
  } else if (typeLabel === 'features_list') {
    parts.push('', 'Generate 4-6 features as a JSON array of {title, description}.');
  } else if (typeLabel === 'cta') {
    parts.push('', 'Generate a CTA as a JSON object with {heading, description, button_text, button_url}.');
  } else {
    parts.push('', `Generate a rich text section with ${ctx.targetWordCount || '200-300'} words using HTML tags (<h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>). Do NOT use markdown syntax.`);
  }

  if (ctx.focusKeywords?.length) {
    parts.push(`Naturally incorporate these keywords: ${ctx.focusKeywords.join(', ')}`);
  }

  if (ctx.additionalInstructions) {
    parts.push('', `ADDITIONAL INSTRUCTIONS: ${ctx.additionalInstructions}`);
  }

  parts.push('', 'Return exactly 1 block in the blocks array.');

  return parts.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Improve existing content
// ---------------------------------------------------------------------------

function buildImprovePrompt(ctx: ContentWriterContext): string {
  const parts = [
    `Improve and rewrite the following content. Make it more compelling, SEO-friendly, and conversion-focused.`,
    `Return the improved content as well-formatted HTML using <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em> tags. Do NOT use markdown syntax.`,
    '',
    `PAGE: ${ctx.pagePath}`,
    `BUSINESS: ${ctx.businessName}`,
    `LOCATION: ${ctx.businessLocation}`,
    ctx.focusKeywords?.length ? `FOCUS KEYWORDS (incorporate naturally): ${ctx.focusKeywords.join(', ')}` : '',
  ];

  // Inject city-specific context
  if (ctx.cityName) {
    parts.push(`CITY: ${ctx.cityName}`);
    if (ctx.cityDistance) parts.push(`DISTANCE FROM SHOP: ${ctx.cityDistance}`);
    if (ctx.localLandmarks) parts.push(`LOCAL LANDMARKS: ${ctx.localLandmarks}`);
    const featured = ctx.serviceHighlights?.filter((s) => s.is_featured) ?? [];
    if (featured.length > 0) {
      parts.push(`FEATURED SERVICES: ${featured.map((s) => s.service_name).join(', ')}`);
    }
  }

  // Inject page context for non-city pages
  if (!ctx.cityName && !ctx.serviceName && ctx.pageContext) {
    if (ctx.pageContext.title) {
      parts.push(`PAGE TITLE: ${ctx.pageContext.title}`);
    }
    if (ctx.pageContext.metaDescription) {
      parts.push(`PAGE DESCRIPTION: ${ctx.pageContext.metaDescription}`);
    }
  }

  parts.push(
    '',
    `EXISTING CONTENT TO IMPROVE:`,
    ctx.existingContent || '',
  );

  if (ctx.additionalInstructions) {
    parts.push('', `ADDITIONAL INSTRUCTIONS: ${ctx.additionalInstructions}`);
  }

  parts.push('', 'Return the improved content as a single rich_text block with HTML content.');

  return parts.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Specialized AI generation — returns raw content (not structured blocks)
// Used for individual field generation: bios, descriptions, terms, CTAs, etc.
// ---------------------------------------------------------------------------

const SPECIALIZED_SYSTEM_PROMPT = `You are a professional copywriter for a premium mobile auto detailing business in the South Bay / Los Angeles area. Write clear, professional content. Return ONLY the requested output format with no additional text.`;

async function callClaudeForText(
  userPrompt: string,
  maxTokens: number = 1500
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: SPECIALIZED_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('AI generation failed:', error);
    throw new Error(`AI generation failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Empty AI response');
  return text.replace(/```json\s*/g, '').replace(/```html\s*/g, '').replace(/```\s*/g, '').trim();
}

export async function generateTeamBio(
  memberName: string,
  memberRole: string,
  businessName: string
): Promise<string> {
  const prompt = `Write a professional, warm 2-3 paragraph bio for ${memberName}, who works as ${memberRole} at ${businessName}. Highlight expertise in auto detailing, customer service, and professionalism. Write in third person. Return HTML formatted content only (use <p> tags for paragraphs).`;
  return callClaudeForText(prompt);
}

export async function generateCredentialDescription(
  credentialTitle: string,
  businessName: string
): Promise<string> {
  const prompt = `Write a brief 2-3 sentence description for the credential/certification: "${credentialTitle}". Explain what it means and why it matters for ${businessName}'s auto detailing customers. Return HTML formatted content only (use <p> tags).`;
  return callClaudeForText(prompt);
}

export async function generateTermsSection(
  sectionTitle: string,
  businessName: string,
  businessPhone: string,
  businessEmail: string
): Promise<string> {
  const prompt = `Write a professional terms and conditions section for "${sectionTitle}" for ${businessName}, a mobile auto detailing service. Contact: ${businessPhone || 'N/A'}, ${businessEmail || 'N/A'}. Write clear, specific language appropriate for a service business. Include relevant protections for both the business and customer. Return HTML formatted content only (use <p> and <ul>/<li> tags as needed).`;
  return callClaudeForText(prompt);
}

export async function generateCtaContent(
  businessName: string,
  existingHeading?: string
): Promise<string> {
  const prompt = `Write a compelling call-to-action for ${businessName}, a premium mobile auto detailing service.${existingHeading ? ` Current heading: "${existingHeading}".` : ''} Generate a short punchy heading (under 10 words), a brief description (1-2 sentences), and button text (2-4 words). Return ONLY a JSON object: {"heading": "...", "description": "...", "button_text": "...", "button_url": "/book"}`;
  return callClaudeForText(prompt);
}

export async function generateTestimonialContent(
  businessName: string
): Promise<string> {
  const prompt = `Write a realistic, positive customer testimonial for ${businessName}, a mobile auto detailing service. Include a quote (2-3 sentences about their detailing experience), customer first name only, star rating (4 or 5), and source (e.g., "Google Review"). Return ONLY a JSON object: {"quote": "...", "author": "...", "rating": 5, "source": "..."}`;
  return callClaudeForText(prompt);
}

// ---------------------------------------------------------------------------
// Master function — routes to the right generator
// ---------------------------------------------------------------------------

export async function generatePageContent(ctx: ContentWriterContext): Promise<ContentWriterResult> {
  let userPrompt: string;
  let maxTokens = 4000;

  switch (ctx.contentType) {
    case 'full_page':
      if (ctx.pageType === 'city_landing') {
        userPrompt = buildCityPagePrompt(ctx);
        maxTokens = 6000;
      } else if (ctx.pageType === 'service_detail' || ctx.pageType === 'service_category') {
        userPrompt = buildServicePagePrompt(ctx);
      } else {
        userPrompt = buildCityPagePrompt(ctx); // fallback
      }
      break;
    case 'section':
    case 'faq':
    case 'intro_paragraph':
    case 'service_description':
      userPrompt = buildSingleBlockPrompt(ctx);
      maxTokens = 2000;
      break;
    case 'improve':
      userPrompt = buildImprovePrompt(ctx);
      maxTokens = 3000;
      break;
    default:
      throw new Error(`Unknown content type: ${ctx.contentType}`);
  }

  return callClaudeForContent(CONTENT_WRITER_SYSTEM_PROMPT, userPrompt, maxTokens);
}

// ---------------------------------------------------------------------------
// Convenience: build context for a city page from DB
// ---------------------------------------------------------------------------

export async function buildCityContext(
  citySlug: string
): Promise<Partial<ContentWriterContext>> {
  const admin = createAdminClient();

  const { data: city } = await admin
    .from('city_landing_pages')
    .select('city_name, slug, state, distance_miles, intro_text, local_landmarks, focus_keywords, service_highlights')
    .eq('slug', citySlug)
    .single();

  if (!city) return {};

  // Also get SEO data if available
  const { data: seo } = await admin
    .from('page_seo')
    .select('focus_keyword')
    .eq('page_path', `/areas/${citySlug}`)
    .maybeSingle();

  const focusKeywords: string[] = [];
  if (seo?.focus_keyword) focusKeywords.push(seo.focus_keyword);
  if (city.focus_keywords) {
    focusKeywords.push(
      ...city.focus_keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
    );
  }

  // Parse service highlights
  let serviceHighlights: ServiceHighlight[] | undefined;
  if (city.service_highlights) {
    try {
      const raw = typeof city.service_highlights === 'string'
        ? JSON.parse(city.service_highlights as string)
        : city.service_highlights;
      if (Array.isArray(raw) && raw.length > 0) {
        serviceHighlights = raw.map((h: Record<string, unknown>) => ({
          id: (h.id as string) || '',
          service_name: (h.service_name as string) || '',
          description: (h.description as string) || '',
          is_featured: Boolean(h.is_featured),
        }));
      }
    } catch {
      // Invalid JSON — skip
    }
  }

  return {
    cityName: city.city_name,
    cityDistance: city.distance_miles ? `${city.distance_miles} miles from Lomita` : undefined,
    localLandmarks: typeof city.local_landmarks === 'string' ? city.local_landmarks : undefined,
    focusKeywords: focusKeywords.length > 0 ? focusKeywords : undefined,
    serviceHighlights,
  };
}

// ---------------------------------------------------------------------------
// Convenience: build context for a service page from DB
// ---------------------------------------------------------------------------

export async function buildServiceContext(
  categorySlug: string,
  serviceSlug: string
): Promise<Partial<ContentWriterContext>> {
  const admin = createAdminClient();

  const { data: svc } = await admin
    .from('services')
    .select('name, description, flat_price, custom_starting_price, service_categories!inner(name)')
    .eq('slug', serviceSlug)
    .single();

  if (!svc) return {};

  const price = svc.flat_price
    ? `$${svc.flat_price}`
    : svc.custom_starting_price
      ? `Starting at $${svc.custom_starting_price}`
      : 'Contact for pricing';

  const catName = (svc.service_categories as unknown as { name: string }).name;

  // Also get SEO data
  const { data: seo } = await admin
    .from('page_seo')
    .select('focus_keyword')
    .eq('page_path', `/services/${categorySlug}/${serviceSlug}`)
    .maybeSingle();

  return {
    serviceName: svc.name,
    serviceCategory: catName,
    serviceDescription: svc.description || undefined,
    servicePrice: price,
    focusKeywords: seo?.focus_keyword ? [seo.focus_keyword] : undefined,
  };
}
