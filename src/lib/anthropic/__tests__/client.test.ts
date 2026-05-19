// @vitest-environment node
// ^ Anthropic SDK refuses to instantiate in a window-bearing environment
//   (jsdom default) without `dangerouslyAllowBrowser: true`. This module is
//   server-only — run its tests in the node environment to match runtime.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  MODELS,
  getAnthropicClient,
  __resetAnthropicClientForTesting,
} from '@/lib/anthropic/client';

describe('MODELS constants', () => {
  it('exports non-empty SONNET and HAIKU model IDs', () => {
    expect(typeof MODELS.SONNET).toBe('string');
    expect(MODELS.SONNET.length).toBeGreaterThan(0);
    expect(typeof MODELS.HAIKU).toBe('string');
    expect(MODELS.HAIKU.length).toBeGreaterThan(0);
  });
});

describe('getAnthropicClient', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    __resetAnthropicClientForTesting();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
    __resetAnthropicClientForTesting();
  });

  it('throws a descriptive error when ANTHROPIC_API_KEY is not set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getAnthropicClient()).toThrowError(/ANTHROPIC_API_KEY/);
  });

  it('returns the same singleton instance across calls when env is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
    const a = getAnthropicClient();
    const b = getAnthropicClient();
    expect(a).toBe(b);
  });
});
