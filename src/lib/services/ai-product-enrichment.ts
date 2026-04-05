/**
 * AI Product Enrichment — prompt builders, response parsers, and citation stripping.
 * The actual API calls go through the Anthropic Message Batches API in the route handlers.
 */

import { specsSchema } from '@/lib/utils/validation';

export const ENRICHMENT_SYSTEM_PROMPT = `You are a product content specialist for a professional auto detailing supply store. You research products from manufacturer websites and create accurate, factual product descriptions and specifications.

RESEARCH PROCESS:
1. Search the web for the exact product by name and manufacturer
2. Find the official manufacturer or authorized retailer product page
3. Extract ONLY factual information from the source — do NOT invent specs, sizes, or features
4. If you cannot find the product or specific information, leave that field empty rather than guessing

ACCURACY RULES:
- NEVER guess or hallucinate product specifications. If the vendor page doesn't list a dilution ratio, leave dilution_ratio empty.
- NEVER invent features not mentioned on the vendor page.
- Product sizes/volumes MUST match what's on the manufacturer page exactly.
- If multiple sources conflict, prefer the manufacturer's own website.

OUTPUT FORMAT:
Return ONLY valid JSON with these fields — no markdown, no backticks, no preamble:
{
  "short_description": "1-2 sentences. What the product is and its primary benefit. Written for product cards and voice agent quick answers. Max 200 characters.",
  "full_description": "2-4 sentences. Detailed description of what the product does, how it works, and why it's effective. Written for the product detail page.",
  "use_case": "Who is this product for and what problem does it solve? 1-2 sentences.",
  "key_features": ["feature 1", "feature 2", "feature 3"],
  "application_method": "How to use this product. Brief instruction.",
  "surface_compatibility": ["paint", "glass", "trim", "wheels"],
  "size_volume": "e.g. 16 oz, 1 Gallon, 250ml",
  "dilution_ratio": "e.g. Ready to use, 10:1, 4:1",
  "coverage_yield": "e.g. 4-6 applications per bottle",
  "scent": "if mentioned on vendor page, otherwise leave empty",
  "pro_tips": "Professional usage tips if found. Otherwise leave empty.",
  "source_url": "The URL where you found the product information"
}

If the product is a tool, pad, towel, or accessory (not a chemical), adapt:
- dilution_ratio: leave empty
- coverage_yield: durability or lifespan if known (e.g. "50+ uses with proper care")
- surface_compatibility: what surfaces/tasks it's designed for
- size_volume: dimensions or size (e.g. "5 inch", "16x16 inches", "3-pack")
- application_method: how to use the tool/accessory`;

export const ENRICHMENT_MODEL = 'claude-haiku-4-5-20251001';

export interface EnrichmentInput {
  productName: string;
  vendorName: string;
  vendorWebsite?: string | null;
  categoryName?: string | null;
  currentDescription?: string | null;
  variantLabel?: string | null;
}

export interface EnrichmentResult {
  shortDescription: string | null;
  specs: Record<string, unknown> | null;
  sourceUrl: string | null;
  error?: string;
}

const OWN_BRAND_NAMES = ['sd auto spa', 'sdas', 'smart details auto spa', 'smart details'];

function isOwnBrand(vendorName: string): boolean {
  return OWN_BRAND_NAMES.includes(vendorName.toLowerCase().trim());
}

function isUnknownVendor(vendorName: string): boolean {
  const v = vendorName.toLowerCase().trim();
  return !v || v === 'unknown';
}

/** Build the user prompt for a single product enrichment request. */
export function buildEnrichmentUserPrompt(input: EnrichmentInput): string {
  const parts = [
    'Research this product and provide accurate specifications:',
    '',
    `PRODUCT NAME: ${input.productName}`,
  ];

  if (isOwnBrand(input.vendorName)) {
    parts.push('MANUFACTURER/VENDOR: Store Brand (Smart Details Auto Spa) — This is a store-branded/private-label product. Search for this product by name on Google to find general product information, reviews, or similar products. If no specific product page exists, generate a description based on the product name, category, and any available information.');
  } else if (isUnknownVendor(input.vendorName)) {
    parts.push('MANUFACTURER/VENDOR: Unknown — search by product name and category only');
  } else {
    parts.push(`MANUFACTURER/VENDOR: ${input.vendorName}`);
  }

  if (input.categoryName) parts.push(`CATEGORY: ${input.categoryName}`);
  if (input.currentDescription) parts.push(`CURRENT DESCRIPTION: ${input.currentDescription}`);
  if (input.variantLabel) parts.push(`VARIANT: ${input.variantLabel}`);

  // Only include vendor website for known third-party vendors
  if (input.vendorWebsite && !isOwnBrand(input.vendorName) && !isUnknownVendor(input.vendorName)) {
    parts.push(`VENDOR WEBSITE: ${input.vendorWebsite} — search this site first`);
  }

  parts.push('', 'Find this exact product on the manufacturer\'s website or authorized retailers. Extract factual specifications only.');

  return parts.join('\n');
}

/** Strip <cite index="...">text</cite> tags from web search responses. */
function stripCitations(text: string): string {
  return text.replace(/<cite[^>]*>/g, '').replace(/<\/cite>/g, '').trim();
}

/** Recursively strip citation tags from all string values in an object. */
export function stripCitationsDeep(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      obj[key] = stripCitations(val);
    } else if (Array.isArray(val)) {
      obj[key] = val.map((item) => (typeof item === 'string' ? stripCitations(item) : item));
    }
  }
}

/**
 * Parse a single enrichment response from Claude's message content blocks.
 * Used by the batch results processor to parse each individual result.
 */
export function parseEnrichmentResponse(
  contentBlocks: Array<{ type: string; text?: string }>
): EnrichmentResult {
  // Extract text from multi-block response (web search returns multiple block types)
  const textBlocks = contentBlocks.filter((block) => block.type === 'text');
  const lastTextBlock = textBlocks[textBlocks.length - 1];

  if (!lastTextBlock?.text) {
    return { shortDescription: null, specs: null, sourceUrl: null, error: 'Empty AI response' };
  }

  // Strip citation tags BEFORE JSON parsing — embedded <cite> tags can break JSON structure
  const citationStripped = lastTextBlock.text
    .replace(/<cite[^>]*>/g, '')
    .replace(/<\/cite>/g, '');

  const cleanedText = citationStripped
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(cleanedText);
  } catch {
    // Try to extract JSON object from surrounding text
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return { shortDescription: null, specs: null, sourceUrl: null, error: 'Could not parse JSON from AI response' };
      }
    } else {
      return { shortDescription: null, specs: null, sourceUrl: null, error: 'Could not parse JSON from AI response' };
    }
  }

  // Strip citation tags from web search responses
  stripCitationsDeep(parsed);

  // Build specs object, stripping empty values
  const rawSpecs: Record<string, unknown> = {
    overview: parsed.full_description || undefined,
    use_case: parsed.use_case || undefined,
    key_features: parsed.key_features?.length ? parsed.key_features : undefined,
    application_method: parsed.application_method || undefined,
    surface_compatibility: parsed.surface_compatibility?.length ? parsed.surface_compatibility : undefined,
    size_volume: parsed.size_volume || undefined,
    dilution_ratio: parsed.dilution_ratio || undefined,
    coverage_yield: parsed.coverage_yield || undefined,
    scent: parsed.scent || undefined,
    pro_tips: parsed.pro_tips || undefined,
  };

  // Strip undefined/null/empty values
  const cleanSpecs = Object.fromEntries(
    Object.entries(rawSpecs).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );

  // Validate against specsSchema
  const validated = specsSchema.safeParse(cleanSpecs);
  const finalSpecs = validated.success && validated.data
    ? Object.keys(validated.data).length > 0 ? validated.data : null
    : Object.keys(cleanSpecs).length > 0 ? cleanSpecs : null;

  return {
    shortDescription: parsed.short_description || null,
    specs: finalSpecs,
    sourceUrl: parsed.source_url || null,
  };
}
