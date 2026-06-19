/**
 * Anthropic SDK thin client wrapper.
 *
 * One place for SDK construction so future migrations of the existing
 * direct-`fetch` call sites (conversation-summary, ai-content-writer,
 * ai-seo, ai-product-enrichment, ai-draft, etc.) can pick up centralized
 * config (env, future retry/timeout policy) without each site rolling
 * its own `new Anthropic({...})`.
 *
 * Current consumers:
 *   - SMS AI v2 agent runner (Layer 3a) — `@/lib/sms-ai/agent-runner`.
 *
 * No retry/timeout overrides at the client level — the agent runner is the
 * authority on per-call deadline and retry policy (SMS AI v2 audit §4.4
 * recommends NO automatic retries on tool failures so the model can decide).
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Model IDs used by SMS AI v2 and future Anthropic-backed services.
 *
 * Format choice: dateless aliases (e.g. `claude-sonnet-4-6` rather than
 * `claude-sonnet-4-20250514`) per the workspace canonical IDs documented in
 * the root CLAUDE.md. Anthropic accepts both forms; the dateless alias
 * pins to the current revision of the named family and auto-tracks
 * future patches. The 10 existing fetch sites use the dated form today and
 * will migrate to these constants in a follow-up workstream.
 */
export const MODELS = {
  SONNET: 'claude-sonnet-4-6',
  HAIKU: 'claude-haiku-4-5',
} as const;

let _client: Anthropic | null = null;

/**
 * Lazy-initialize and return a singleton Anthropic SDK client.
 *
 * Throws a descriptive error if `ANTHROPIC_API_KEY` is not set at the
 * moment of first use. Lazy initialization keeps test imports cheap
 * (tests mock at the module boundary; the real SDK never instantiates).
 */
export function getAnthropicClient(): Anthropic {
  if (_client) return _client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Required for Anthropic SDK usage (SMS AI v2 agent runner, AI content writer, etc.).',
    );
  }

  _client = new Anthropic({ apiKey });
  return _client;
}

/** Test-only: reset the cached singleton so unit tests can re-trigger init. */
export function __resetAnthropicClientForTesting(): void {
  _client = null;
}
