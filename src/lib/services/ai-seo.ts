import { extractPageContentByPath } from '@/lib/services/page-content-extractor';
import type { KnownPage } from '@/lib/seo/known-pages';

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
  availablePages?: KnownPage[];
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
  internal_links: Array<{ text: string; url: string }>;
  suggestions: string[];
}

const SEO_SYSTEM_PROMPT = `You are a seasoned SEO expert optimizing pages for a local mobile auto detailing business. Generate SEO fields that maximize the scoring algorithm described below.

CHARACTER COUNT RULES:

Your SEO title MUST be exactly 50-60 characters (including spaces and punctuation). Not 49. Not 61. Count carefully. Before finalizing, count every character in your title. If your title is 48 characters, add a modifier word. If it's 63 characters, shorten a word or remove a separator. Use "|" or "—" as separators to help hit the target range. Common pattern: "{Primary Keyword} | {Business Name}" or "{Primary Keyword} — {Location}".

Your meta description MUST be exactly 150-160 characters (including spaces and punctuation). Not 149. Not 161. This is your most important conversion text — it appears in search results. Include a call-to-action (Book now, Call today, Get a free quote). Include a unique selling proposition (professional-grade, certified, 5-star rated). Before finalizing, count every character. Adjust word choices to land in the 150-160 range.

URL-DERIVED FOCUS KEYWORDS — CRITICAL SCORING RULE:

The scoring system takes your focus keyword, replaces all spaces with hyphens, and checks if that hyphenated string appears as a contiguous substring in the page URL path. This means your focus keyword words must appear as consecutive hyphenated slug segments already in the URL.

RULE: Your focus keyword MUST be composed ONLY of words that already appear as contiguous hyphenated segments in the URL path. Do NOT add location names, intent modifiers, or any other words unless they are already in the URL.

Examples:
- URL: /services/ceramic-coatings/ceramic-pro → focus keyword: "ceramic pro" ✅ (ceramic-pro is in the path)
- URL: /services/ceramic-coatings/ceramic-pro → focus keyword: "ceramic pro lomita" ❌ (ceramic-pro-lomita is NOT in the path)
- URL: /products/protection/ceramic-spray-coating → focus keyword: "ceramic spray coating" ✅
- URL: /areas/torrance → focus keyword: "torrance" ✅
- URL: /areas/torrance → focus keyword: "auto detailing torrance" ❌ (auto-detailing-torrance is NOT in the path)
- URL: /services/paint-correction/full-paint-correction → focus keyword: "full paint correction" ✅
- URL: /services/paint-correction → focus keyword: "paint correction" ✅

Process:
1. Look at the URL path segments (split by /)
2. For each segment, convert hyphens to spaces — these are your candidate keyword phrases
3. Pick the most specific and relevant segment as your focus keyword
4. You may use a substring of a segment but NEVER add words not in the URL

For generic URLs (/, /book, /gallery, /terms) where no meaningful keyword exists in the path, pick the best keyword for the page's purpose and accept that it won't match the URL.

INTERNAL LINKS:

You will receive a list of available pages on the website. You MUST suggest 2-4 relevant internal links for each page.

Rules:
- Link to related services, products, or locations — not random pages
- For service pages: link to related services in the same category, the parent category page, and the booking page
- For product pages: link to related products, the parent category, and relevant service pages
- For city landing pages: link to top services, booking page, and nearby city pages
- For category pages: link to 2-3 top individual items in that category
- Each link needs display text (anchor text) that includes relevant keywords — NOT "click here" or "learn more"
- Example: {"text": "Ceramic Coating Services", "url": "/services/ceramic-coatings"}
- ONLY use URLs from the provided list — do not invent URLs
- Return links as an array of {text, url} objects in the internal_links field
- If no available pages list is provided, return an empty array for internal_links

OUTPUT FORMAT:

Return ONLY valid JSON with these exact fields — no markdown, no backticks, no preamble:
{
  "seo_title": "exactly 50-60 characters",
  "meta_description": "exactly 150-160 characters",
  "meta_keywords": "5-10 comma-separated keywords including location variants and near-me",
  "focus_keyword": "2-4 word phrase using ONLY words from the URL slug",
  "og_title": "slightly different from seo_title, optimized for social sharing, 40-65 chars",
  "og_description": "slightly different from meta_description, more conversational, 100-160 chars",
  "internal_links": [{"text": "keyword-rich anchor text", "url": "/valid/page/path"}],
  "suggestions": ["actionable improvement suggestion 1", "suggestion 2"]
}

GENERAL SEO BEST PRACTICES:

- Include the business location (Lomita, CA or South Bay) naturally in titles and descriptions — but NOT in the focus keyword unless the location is in the URL
- Use power words: Professional, Certified, Expert, Premium, Trusted, Top-Rated
- Include a CTA in every meta description: Book Today, Call Now, Get a Free Quote, Schedule Online
- For service pages: mention the key benefit, not just the service name
- For product pages: mention the product's primary use case
- For city pages: emphasize local service availability and proximity
- OG title should be slightly more engaging/clickable than the SEO title
- OG description should be more conversational than the meta description`;

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
      max_tokens: 1500,
      system: SEO_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('AI SEO generation failed:', error);
    if (response.status === 429) {
      throw new Error('rate_limit: Too many requests — please wait before retrying');
    }
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

    // Ensure internal_links is an array
    if (!Array.isArray(result.internal_links)) {
      result.internal_links = [];
    }

    // --- Validation logging ---
    const titleLen = result.seo_title.length;
    if (titleLen < 50 || titleLen > 60) {
      console.warn(`[SEO AI] Title length ${titleLen} outside 50-60 range for ${input.pagePath}: "${result.seo_title}"`);
    }

    const descLen = result.meta_description.length;
    if (descLen < 150 || descLen > 160) {
      console.warn(`[SEO AI] Description length ${descLen} outside 150-160 range for ${input.pagePath}`);
    }

    const fk = result.focus_keyword.toLowerCase().trim();
    if (!result.seo_title.toLowerCase().includes(fk)) {
      console.warn(`[SEO AI] Focus keyword "${fk}" not found in title for ${input.pagePath}`);
    }

    const slugifiedFk = fk.replace(/\s+/g, '-');
    if (!input.pagePath.toLowerCase().includes(slugifiedFk)) {
      console.warn(`[SEO AI] Focus keyword "${fk}" (slugified: "${slugifiedFk}") not in URL path ${input.pagePath}`);
    }

    // Filter out invalid internal links (URL must exist in available pages)
    if (result.internal_links.length > 0 && input.availablePages) {
      const validPaths = new Set(input.availablePages.map(p => p.path));
      const validLinks: Array<{ text: string; url: string }> = [];
      for (const link of result.internal_links) {
        if (link.url && link.text && validPaths.has(link.url)) {
          validLinks.push(link);
        } else {
          console.warn(`[SEO AI] Filtered invalid internal link for ${input.pagePath}: ${JSON.stringify(link)}`);
        }
      }
      result.internal_links = validLinks;
    }

    return result;
  } catch (err) {
    // Re-throw our own validation errors
    if (err instanceof Error && err.message === 'AI returned incomplete SEO data') {
      throw err;
    }
    console.error('Failed to parse AI SEO response:', text);
    throw new Error('AI returned invalid JSON for SEO data');
  }
}

/**
 * Filter available pages to a relevant subset for the current page.
 * Category is inferred from URL path since KnownPage has no category field.
 * Caps at ~30-40 pages to limit token usage.
 */
function filterRelevantPages(
  allPages: KnownPage[],
  currentPath: string,
  currentType: string
): KnownPage[] {
  const ALWAYS_INCLUDE = ['/', '/book', '/services', '/products', '/gallery'];
  const relevant = new Set<string>(ALWAYS_INCLUDE);

  // Parse category from path: /services/ceramic-coatings/ceramic-pro → "ceramic-coatings"
  const segments = currentPath.split('/').filter(Boolean);
  const categoryPrefix = segments.length >= 2 ? `/${segments[0]}/${segments[1]}` : null;

  if (currentType === 'service_detail' || currentType === 'service_category') {
    // Include all pages under same service category + all service category pages
    for (const p of allPages) {
      if (p.page_type === 'service_category') relevant.add(p.path);
      if (categoryPrefix && p.path.startsWith(categoryPrefix + '/')) relevant.add(p.path);
    }
    // Add a few city pages
    const cityPages = allPages.filter(p => p.page_type === 'city_landing');
    for (const c of cityPages.slice(0, 3)) relevant.add(c.path);
  } else if (currentType === 'product_detail' || currentType === 'product_category') {
    // Include all pages under same product category + all product category pages
    for (const p of allPages) {
      if (p.page_type === 'product_category') relevant.add(p.path);
      if (categoryPrefix && p.path.startsWith(categoryPrefix + '/')) relevant.add(p.path);
    }
    // Add service category pages for cross-linking
    const serviceCats = allPages.filter(p => p.page_type === 'service_category');
    for (const s of serviceCats.slice(0, 3)) relevant.add(s.path);
  } else if (currentType === 'city_landing') {
    // Top services + booking + nearby cities
    const serviceDetails = allPages.filter(p => p.page_type === 'service_detail');
    for (const s of serviceDetails.slice(0, 6)) relevant.add(s.path);
    const serviceCats = allPages.filter(p => p.page_type === 'service_category');
    for (const s of serviceCats) relevant.add(s.path);
    const cityPages = allPages.filter(p => p.page_type === 'city_landing' && p.path !== currentPath);
    for (const c of cityPages.slice(0, 3)) relevant.add(c.path);
  } else {
    // Homepage, gallery, booking, terms, custom — include top services + products
    const serviceCats = allPages.filter(p => p.page_type === 'service_category');
    for (const s of serviceCats.slice(0, 4)) relevant.add(s.path);
    const productCats = allPages.filter(p => p.page_type === 'product_category');
    for (const p of productCats.slice(0, 3)) relevant.add(p.path);
    const cityPages = allPages.filter(p => p.page_type === 'city_landing');
    for (const c of cityPages.slice(0, 2)) relevant.add(c.path);
  }

  // Remove current page from suggestions
  relevant.delete(currentPath);

  // Filter and cap at 40
  const filtered = allPages.filter(p => relevant.has(p.path));
  return filtered.slice(0, 40);
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

  // Add available pages for internal link generation
  if (input.availablePages && input.availablePages.length > 0) {
    const relevantPages = filterRelevantPages(input.availablePages, input.pagePath, input.pageType);
    if (relevantPages.length > 0) {
      parts.push('');
      parts.push('AVAILABLE PAGES FOR INTERNAL LINKS (use ONLY these URLs):');
      for (const p of relevantPages) {
        parts.push(`- ${p.path} (${p.page_type}: ${p.title})`);
      }
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
  currentSeo?: PageContentForSeo['currentSeo'],
  availablePages?: KnownPage[]
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
    availablePages,
  });
}
