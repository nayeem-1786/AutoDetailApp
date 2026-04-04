/**
 * AI Product Enrichment — uses Claude with web search to research products
 * on vendor websites and extract structured specs + descriptions.
 */

import { specsSchema } from '@/lib/utils/validation';

const SYSTEM_PROMPT = `You are a product content specialist for a professional auto detailing supply store. You research products from manufacturer websites and create accurate, factual product descriptions and specifications.

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

export async function enrichProduct(input: EnrichmentInput): Promise<EnrichmentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { shortDescription: null, specs: null, sourceUrl: null, error: 'ANTHROPIC_API_KEY not configured' };
  }

  const userPrompt = buildUserPrompt(input);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429) {
          throw new Error('rate_limit');
        }
        throw new Error(`API error ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();

      // Extract text from multi-block response (web search returns multiple block types)
      const textBlocks = (data.content ?? []).filter(
        (block: { type: string }) => block.type === 'text'
      );
      const lastTextBlock = textBlocks[textBlocks.length - 1];

      if (!lastTextBlock?.text) {
        if (attempt === 0) continue; // retry once
        return { shortDescription: null, specs: null, sourceUrl: null, error: 'Empty AI response' };
      }

      const jsonStr = lastTextBlock.text
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const parsed = JSON.parse(jsonStr);

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';

      // Rate limit — don't retry, propagate for batch handler
      if (msg === 'rate_limit') {
        return { shortDescription: null, specs: null, sourceUrl: null, error: 'rate_limit' };
      }

      // JSON parse error on first attempt — retry
      if (attempt === 0 && (msg.includes('JSON') || msg.includes('Unexpected token'))) {
        continue;
      }

      return { shortDescription: null, specs: null, sourceUrl: null, error: msg };
    }
  }

  return { shortDescription: null, specs: null, sourceUrl: null, error: 'Failed after retries' };
}

function buildUserPrompt(input: EnrichmentInput): string {
  const parts = [
    'Research this product and provide accurate specifications:',
    '',
    `PRODUCT NAME: ${input.productName}`,
    `MANUFACTURER/VENDOR: ${input.vendorName}`,
  ];

  if (input.categoryName) parts.push(`CATEGORY: ${input.categoryName}`);
  if (input.currentDescription) parts.push(`CURRENT DESCRIPTION: ${input.currentDescription}`);
  if (input.variantLabel) parts.push(`VARIANT: ${input.variantLabel}`);
  if (input.vendorWebsite) parts.push(`VENDOR WEBSITE: ${input.vendorWebsite} — search this site first`);

  parts.push('', 'Find this exact product on the manufacturer\'s website or authorized retailers. Extract factual specifications only.');

  return parts.join('\n');
}
