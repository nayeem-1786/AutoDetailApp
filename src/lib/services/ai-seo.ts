import { extractPageContentByPath } from '@/lib/services/page-content-extractor';

// ---------------------------------------------------------------------------
// AI SEO Service — Claude API wrapper for SEO content generation
// Reuses ANTHROPIC_API_KEY from messaging integration
// ---------------------------------------------------------------------------

export interface PageContentForSeo {
  pagePath: string;
  pageType: string;
  pageTitle: string;
  pageContent: string;
  businessName: string;
  businessLocation: string;
  currentSeo?: {
    seo_title: string | null;
    meta_description: string | null;
    meta_keywords: string | null;
    focus_keyword: string | null;
    og_title: string | null;
    og_description: string | null;
  };
}

export interface AiSeoResult {
  seo_title: string;
  meta_description: string;
  meta_keywords: string;
  focus_keyword: string;
  og_title: string;
  og_description: string;
  suggestions: string[];
}

const SEO_SYSTEM_PROMPT = `You are a seasoned SEO expert with 10+ years of experience optimizing local service businesses, specifically auto detailing and car care businesses.

Your role is to generate optimized SEO fields for web pages. Follow these rules strictly:

TITLE RULES (seo_title):
- Must be 50-60 characters
- Include the primary keyword near the beginning
- Include the business name or location naturally
- Use power separators: | or — (not -)
- For service pages: "[Service] [City] [State] | [Business Name]"
- For product pages: "[Product] | [Category] | [Business Name]"
- For city pages: "[City] Auto Detailing | [Service Keywords] | [Business Name]"

META DESCRIPTION RULES (meta_description):
- Must be 150-160 characters
- Include a compelling call-to-action (Book today, Schedule now, Get a quote)
- Include the primary keyword naturally
- Use power words: Professional, Expert, Certified, Premium, Trusted
- Mention unique selling points (ratings, certifications, mobile service)
- End with a CTA or benefit

KEYWORDS RULES (meta_keywords):
- 5-10 comma-separated keywords
- Mix short-tail and long-tail keywords
- Include location-based keywords (city + state)
- Include "near me" variants for local pages
- Include service-specific terms

FOCUS KEYWORD RULES (focus_keyword):
- Single primary keyword phrase (2-4 words)
- Should be the most searchable term for this page
- Must appear naturally in the title and description
- For local pages: include city name

OPEN GRAPH RULES:
- og_title: Can be slightly different from seo_title, optimized for social sharing (more engaging)
- og_description: Shorter and punchier than meta_description, focused on click-through

SUGGESTIONS:
- Provide 2-4 actionable SEO improvement recommendations specific to this page
- Consider content gaps, internal linking opportunities, structured data, etc.

LOCAL SEO PRIORITIES:
- Always include city/area names for service and city pages
- Target "near me" search intent
- Reference the service area (South Bay, Los Angeles area)
- Include Google rating mentions where appropriate
- Emphasize mobile/on-location service availability when applicable

RESPONSE FORMAT:
Return ONLY valid JSON matching this exact structure, with no additional text:
{
  "seo_title": "...",
  "meta_description": "...",
  "meta_keywords": "...",
  "focus_keyword": "...",
  "og_title": "...",
  "og_description": "...",
  "suggestions": ["...", "..."]
}`;

/**
 * Generate AI-optimized SEO content for a single page.
 */
export async function generateSeoForPage(input: PageContentForSeo): Promise<AiSeoResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const userPrompt = buildUserPrompt(input);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SEO_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('AI SEO generation failed:', error);
    throw new Error(`AI SEO generation failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;

  if (!text) {
    throw new Error('Empty AI SEO response');
  }

  // Parse JSON response — handle potential markdown code fences
  const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    const result = JSON.parse(jsonStr) as AiSeoResult;
    // Validate required fields
    if (!result.seo_title || !result.meta_description || !result.focus_keyword) {
      throw new Error('AI returned incomplete SEO data');
    }
    return result;
  } catch {
    console.error('Failed to parse AI SEO response:', text);
    throw new Error('AI returned invalid JSON for SEO data');
  }
}

function buildUserPrompt(input: PageContentForSeo): string {
  const parts = [
    `Generate optimized SEO fields for the following page:`,
    '',
    `PAGE PATH: ${input.pagePath}`,
    `PAGE TYPE: ${input.pageType}`,
    `BUSINESS: ${input.businessName}`,
    `LOCATION: ${input.businessLocation}`,
    '',
    `PAGE CONTENT:`,
    input.pageContent,
  ];

  if (input.currentSeo) {
    const current = input.currentSeo;
    const hasCurrent = current.seo_title || current.meta_description || current.focus_keyword;
    if (hasCurrent) {
      parts.push('');
      parts.push('CURRENT SEO (optimize/improve these):');
      if (current.seo_title) parts.push(`Current Title: ${current.seo_title}`);
      if (current.meta_description) parts.push(`Current Description: ${current.meta_description}`);
      if (current.meta_keywords) parts.push(`Current Keywords: ${current.meta_keywords}`);
      if (current.focus_keyword) parts.push(`Current Focus Keyword: ${current.focus_keyword}`);
      if (current.og_title) parts.push(`Current OG Title: ${current.og_title}`);
      if (current.og_description) parts.push(`Current OG Description: ${current.og_description}`);
    }
  }

  return parts.join('\n');
}

/**
 * Generate SEO for a page by path — extracts content automatically.
 */
export async function generateSeoByPath(
  pagePath: string,
  pageType: string,
  pageTitle: string,
  businessName: string,
  businessLocation: string,
  currentSeo?: PageContentForSeo['currentSeo']
): Promise<AiSeoResult> {
  const pageContent = await extractPageContentByPath(pagePath);

  return generateSeoForPage({
    pagePath,
    pageType,
    pageTitle,
    pageContent,
    businessName,
    businessLocation,
    currentSeo,
  });
}
