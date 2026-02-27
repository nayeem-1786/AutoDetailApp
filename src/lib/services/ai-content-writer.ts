import { createAdminClient } from '@/lib/supabase/admin';
import type { ContentBlockType } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// AI Content Writer — Claude API wrapper for page content generation
// Reuses ANTHROPIC_API_KEY from messaging/SEO integration
// ---------------------------------------------------------------------------

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
  serviceName?: string;
  serviceCategory?: string;
  serviceDescription?: string;
  servicePrice?: string;
  productName?: string;
  productDescription?: string;

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
- Use H2/H3 headings (## and ###) for SEO structure
- For FAQ blocks: write 5-8 questions real customers would ask, with detailed answers
- For feature lists: focus on benefits, not just features
- All content must be unique per page — no duplicate content across city pages
- Return content as markdown

BLOCK TYPE RULES:
- "rich_text": Write markdown paragraphs with headings. Use ## for section titles, ### for subsections.
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

For rich_text blocks, "content" is markdown text.
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
    ctx.localLandmarks ? `LOCAL LANDMARKS: ${ctx.localLandmarks}` : '',
    ctx.focusKeywords?.length ? `FOCUS KEYWORDS: ${ctx.focusKeywords.join(', ')}` : '',
    '',
    `Generate these blocks IN ORDER:`,
    `1. "rich_text" — City-specific intro paragraph mentioning ${ctx.cityName}, distance, and local context (150-200 words)`,
    `2. "rich_text" — "Why Choose ${ctx.businessName} in ${ctx.cityName}" — mobile service convenience, certifications, local knowledge (200-300 words)`,
    `3. "features_list" — "Popular Services in ${ctx.cityName}" — Top 4-5 services with benefit-focused descriptions (JSON array of {title, description})`,
    `4. "rich_text" — "The Smart Details Difference" — Differentiators, quality commitment, premium products (150-250 words)`,
    `5. "faq" — 6-8 city-specific FAQ questions real customers would ask, with detailed answers (JSON array of {question, answer})`,
    `6. "cta" — Booking CTA: "Ready for Premium Detailing in ${ctx.cityName}?" (JSON object with heading, description, button_text, button_url="/book")`,
    '',
    `CRITICAL: Each section must have UNIQUE content specific to ${ctx.cityName}. DO NOT use generic content that could apply to any city.`,
  ];

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

  if (typeLabel === 'faq') {
    parts.push('', 'Generate 5-8 Q&A pairs as a JSON array of {question, answer}.');
  } else if (typeLabel === 'features_list') {
    parts.push('', 'Generate 4-6 features as a JSON array of {title, description}.');
  } else if (typeLabel === 'cta') {
    parts.push('', 'Generate a CTA as a JSON object with {heading, description, button_text, button_url}.');
  } else {
    parts.push('', `Generate a rich text section with ${ctx.targetWordCount || '200-300'} words.`);
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
    '',
    `PAGE: ${ctx.pagePath}`,
    `BUSINESS: ${ctx.businessName}`,
    `LOCATION: ${ctx.businessLocation}`,
    ctx.focusKeywords?.length ? `FOCUS KEYWORDS: ${ctx.focusKeywords.join(', ')}` : '',
    '',
    `EXISTING CONTENT TO IMPROVE:`,
    ctx.existingContent || '',
  ];

  if (ctx.additionalInstructions) {
    parts.push('', `ADDITIONAL INSTRUCTIONS: ${ctx.additionalInstructions}`);
  }

  parts.push('', 'Return the improved content as a single rich_text block.');

  return parts.filter(Boolean).join('\n');
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
    .select('city_name, slug, state, distance_miles, intro_text, local_landmarks, focus_keywords')
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

  return {
    cityName: city.city_name,
    cityDistance: city.distance_miles ? `${city.distance_miles} miles from Lomita` : undefined,
    localLandmarks: typeof city.local_landmarks === 'string' ? city.local_landmarks : undefined,
    focusKeywords: focusKeywords.length > 0 ? focusKeywords : undefined,
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
