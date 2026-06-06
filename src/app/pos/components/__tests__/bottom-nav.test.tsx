import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { BottomNav } from '../bottom-nav';

// BottomNav's useEffect calls window.matchMedia at mount (PWA standalone +
// fullscreen capability detection). jsdom does not implement matchMedia, so
// stub it before any render. Always returns false; the BottomNav's branches
// that depend on it (Refresh App, Fullscreen) just won't render — irrelevant
// to the Appointments-tab retirement assertions below.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

// Session 1.6 — POS > Appointments tab retired per AC-4 (POS > Jobs as the
// unified surface). This regression-locking test pins the absence of the
// Appointments tab + the /pos/appointments href in the rendered nav so that
// any future refactor that re-adds it fails immediately at test time. The
// redirect at the middleware layer remains the user-facing safety net (see
// src/__tests__/middleware.test.ts), but the nav is the visible surface this
// test guards.

vi.mock('next/navigation', () => ({
  usePathname: () => '/pos',
}));

vi.mock('../../context/pos-theme-context', () => ({
  usePosTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
}));

vi.mock('../../context/pos-permission-context', () => ({
  usePosPermission: () => ({ granted: false }),
}));

vi.mock('../shop-use-dialog', () => ({
  ShopUseDialog: () => null,
}));

describe('BottomNav — Session 1.6 Appointments tab retirement', () => {
  it('does NOT render an Appointments tab label', () => {
    const { container } = render(<BottomNav onOpenShortcuts={vi.fn()} />);
    expect(container.textContent).not.toContain('Appointments');
  });

  it('does NOT contain any link to /pos/appointments', () => {
    const { container } = render(<BottomNav onOpenShortcuts={vi.fn()} />);
    const anchors = container.querySelectorAll('a');
    for (const a of Array.from(anchors)) {
      expect(a.getAttribute('href') ?? '').not.toBe('/pos/appointments');
    }
  });

  it('still renders the four canonical POS tabs (Transactions, Quotes, Sale, Jobs)', () => {
    const { container } = render(<BottomNav onOpenShortcuts={vi.fn()} />);
    expect(container.textContent).toContain('Transactions');
    expect(container.textContent).toContain('Quotes');
    expect(container.textContent).toContain('Sale');
    expect(container.textContent).toContain('Jobs');
  });
});
