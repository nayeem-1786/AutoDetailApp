import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CustomerLookup } from '../customer-lookup';

// posFetch is only called on user input (searchInput length >= 2); not invoked on mount.
vi.mock('../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })),
}));

afterEach(cleanup);

describe('CustomerLookup phone input — scanner hook opt-out attribute', () => {
  it('carries data-barcode-scan-target="input" to bypass the scanner hook release-as-typing path', () => {
    render(
      <CustomerLookup
        onSelect={() => {}}
        onGuest={() => {}}
        onCreateNew={() => {}}
      />
    );

    const input = screen.getByPlaceholderText('Search by name or phone...') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.getAttribute('data-barcode-scan-target')).toBe('input');
  });
});
