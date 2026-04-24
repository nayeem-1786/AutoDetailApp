import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

// -----------------------------------------------------------------------
// Mocks — registered BEFORE the SUT import
// -----------------------------------------------------------------------

const routerMock = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() };
const paramsMock = { id: 'count-1' };

vi.mock('next/navigation', () => ({
  useParams: () => paramsMock,
  useRouter: () => routerMock,
}));

const toastFns = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => {
  const toast = Object.assign((msg: string) => msg, {
    success: (msg: string) => toastFns.success(msg),
    error: (msg: string) => toastFns.error(msg),
  });
  return { toast };
});

vi.mock('@/lib/hooks/use-barcode-scanner', () => ({
  useBarcodeScanner: () => {},
}));

// Permission gate — toggled per test.
const permissionState = { canRevert: true };
vi.mock('@/lib/hooks/use-permission', () => ({
  usePermission: (key: string) => {
    if (key === 'inventory.counts.revert') {
      return { granted: permissionState.canRevert, loading: false };
    }
    return { granted: true, loading: false };
  },
}));

// adminFetch mock — dispatch by URL.
type FetchResponse = { status: number; body: unknown };
const fetchHandlers: Record<string, (init?: RequestInit) => FetchResponse> = {};
const fetchCalls: Array<{ url: string; method: string; body: unknown }> = [];

vi.mock('@/lib/utils/admin-fetch', () => ({
  adminFetch: async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    let parsed: unknown = undefined;
    if (init?.body && typeof init.body === 'string') {
      try {
        parsed = JSON.parse(init.body);
      } catch {
        /* ignore */
      }
    }
    fetchCalls.push({ url, method, body: parsed });

    const handler = fetchHandlers[`${method} ${url}`] ?? fetchHandlers[url];
    if (!handler) {
      throw new Error(`No mock handler for ${method} ${url}`);
    }
    const { status, body } = handler(init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  },
}));

// Imported AFTER mocks.
import Page from '../[id]/page';

// -----------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------

interface CountFixture {
  count: {
    id: string;
    status: 'active' | 'review' | 'committed' | 'cancelled';
    count_type: string;
    section_label: string | null;
    notes: string | null;
    started_by: string;
    started_at: string;
    committed_by: string | null;
    committed_at: string | null;
    cancelled_by: string | null;
    cancelled_at: string | null;
    started_by_employee: { id: string; first_name: string; last_name: string } | null;
    committed_by_employee: { id: string; first_name: string; last_name: string } | null;
    cancelled_by_employee: { id: string; first_name: string; last_name: string } | null;
  };
  items: unknown[];
}

function committedCountResponse(): CountFixture {
  return {
    count: {
      id: 'count-1',
      status: 'committed',
      count_type: 'sectional',
      section_label: 'Shelf A',
      notes: null,
      started_by: 'emp-1',
      started_at: '2026-04-20T10:00:00Z',
      committed_by: 'emp-2',
      committed_at: '2026-04-20T12:00:00Z',
      cancelled_by: null,
      cancelled_at: null,
      started_by_employee: { id: 'emp-1', first_name: 'Alice', last_name: 'Tester' },
      committed_by_employee: { id: 'emp-2', first_name: 'Bob', last_name: 'Committer' },
      cancelled_by_employee: null,
    },
    items: [
      {
        id: 'i1',
        stock_count_id: 'count-1',
        product_id: 'p1',
        expected_qty: 5,
        counted_qty: 8,
        last_updated_by: 'emp-1',
        updated_at: '2026-04-20T11:00:00Z',
        product: { id: 'p1', name: 'Widget A', sku: 'W-A', barcode: null, image_url: null },
        last_updated_by_employee: { id: 'emp-1', first_name: 'Alice', last_name: 'Tester' },
      },
    ],
  };
}

function cleanPreviewResponse() {
  return {
    count: { id: 'count-1', status: 'committed', section_label: 'Shelf A', committed_at: '2026-04-20T12:00:00Z' },
    revertable: true,
    reversals_count: 1,
    original_products: 1,
    has_drift: false,
    drift_adjustments: 0,
    drift_products: 0,
    top_drifted: [],
    projected_negative_products: [],
  };
}

function driftedPreviewResponse() {
  return {
    count: { id: 'count-1', status: 'committed', section_label: 'Shelf A', committed_at: '2026-04-20T12:00:00Z' },
    revertable: true,
    reversals_count: 1,
    original_products: 1,
    has_drift: true,
    drift_adjustments: 3,
    drift_products: 1,
    top_drifted: [
      { product_id: 'p1', product_name: 'Widget A', sku: 'W-A', adjustment_count: 3, net_change: -2 },
    ],
    projected_negative_products: [],
  };
}

function negativePreviewResponse() {
  return {
    count: { id: 'count-1', status: 'committed', section_label: 'Shelf A', committed_at: '2026-04-20T12:00:00Z' },
    revertable: true,
    reversals_count: 2,
    original_products: 2,
    has_drift: false,
    drift_adjustments: 0,
    drift_products: 0,
    top_drifted: [],
    projected_negative_products: [
      {
        product_id: 'p1',
        name: 'Widget A',
        sku: 'W-A',
        current_qty: 2,
        target_qty: -3,
      },
    ],
  };
}

function stalePreviewResponse() {
  return {
    count: { id: 'count-1', status: 'cancelled', section_label: 'Shelf A', committed_at: '2026-04-20T12:00:00Z' },
    revertable: false,
    reason: 'Count is cancelled',
  };
}

// -----------------------------------------------------------------------
// Lifecycle
// -----------------------------------------------------------------------

beforeEach(() => {
  Object.keys(fetchHandlers).forEach((k) => delete fetchHandlers[k]);
  fetchCalls.length = 0;
  permissionState.canRevert = true;
  toastFns.success.mockClear();
  toastFns.error.mockClear();
  routerMock.push.mockClear();

  // Default handler for loadCount
  fetchHandlers['/api/admin/inventory/counts/count-1'] = () => ({
    status: 200,
    body: committedCountResponse(),
  });
});

afterEach(() => {
  cleanup();
});

async function renderAndWait() {
  act(() => {
    render(<Page />);
  });
  await waitFor(() => {
    expect(screen.queryByText(/Count:/i)).not.toBeNull();
  });
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('Revert flow — gating (Session 42K)', () => {
  it('renders Revert button when count is committed and user has permission', async () => {
    await renderAndWait();
    const btn = screen.queryByRole('button', { name: /revert count/i });
    expect(btn).not.toBeNull();
  });

  it('hides Revert button when user lacks inventory.counts.revert permission', async () => {
    permissionState.canRevert = false;
    await renderAndWait();
    const btn = screen.queryByRole('button', { name: /revert count/i });
    expect(btn).toBeNull();
  });

  it('hides Revert button for non-committed counts (active)', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1'] = () => {
      const fixture = committedCountResponse();
      fixture.count.status = 'active';
      fixture.count.committed_at = null;
      fixture.count.committed_by = null;
      fixture.count.committed_by_employee = null;
      return { status: 200, body: fixture };
    };
    await renderAndWait();
    expect(screen.queryByRole('button', { name: /revert count/i })).toBeNull();
  });

  it('hides Revert button for already-cancelled counts', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1'] = () => {
      const fixture = committedCountResponse();
      fixture.count.status = 'cancelled';
      fixture.count.cancelled_by = 'emp-3';
      fixture.count.cancelled_at = '2026-04-23T09:00:00Z';
      fixture.count.cancelled_by_employee = { id: 'emp-3', first_name: 'Carol', last_name: 'Reverter' };
      return { status: 200, body: fixture };
    };
    await renderAndWait();
    expect(screen.queryByRole('button', { name: /revert count/i })).toBeNull();
  });
});

describe('Revert flow — preview fetch (Session 42K)', () => {
  it('fetches revert-preview when the dialog opens', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => ({
      status: 200,
      body: cleanPreviewResponse(),
    });
    await renderAndWait();
    const btn = screen.getByRole('button', { name: /revert count/i });
    act(() => {
      fireEvent.click(btn);
    });
    await waitFor(() => {
      const previewCalls = fetchCalls.filter((c) =>
        c.url.includes('/revert-preview')
      );
      expect(previewCalls.length).toBe(1);
    });
  });

  it('renders clean-revert description (no amber banner) when preview has no drift', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => ({
      status: 200,
      body: cleanPreviewResponse(),
    });
    await renderAndWait();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /revert count/i }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/This will inverse/i)).not.toBeNull();
    });
    // Drift warning should NOT be present.
    expect(screen.queryByText(/non-count adjustment/i)).toBeNull();
  });

  it('renders drift warning with top-drifted list when preview has drift', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => ({
      status: 200,
      body: driftedPreviewResponse(),
    });
    await renderAndWait();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /revert count/i }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/non-count adjustment/i)).not.toBeNull();
    });
    // "Widget A" appears in both the items table and the drift list; assert
    // the drift row's specific formatting instead.
    expect(screen.queryByText(/3 adj · net -2/)).not.toBeNull();
  });
});

describe('Revert flow — type-to-confirm + submission (Session 42K)', () => {
  it('confirm button is disabled until "CONFIRM" is typed exactly', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => ({
      status: 200,
      body: cleanPreviewResponse(),
    });
    await renderAndWait();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /revert count/i }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/This will inverse/i)).not.toBeNull();
    });

    // The modal's confirm button renders with label "Revert Count" — but we
    // already have a trigger button with the same label. Query by order: the
    // second "Revert Count" button is the dialog's confirm button.
    const buttons = screen.getAllByRole('button', { name: /revert count/i });
    const confirmBtn = buttons[buttons.length - 1];
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);

    const phraseInput = screen.getByPlaceholderText(/Type "CONFIRM" to confirm/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(phraseInput, { target: { value: 'CONFIRM' } });
    });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('submits POST /revert with confirmed_drift=false on clean revert', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => ({
      status: 200,
      body: cleanPreviewResponse(),
    });
    fetchHandlers['POST /api/admin/inventory/counts/count-1/revert'] = () => ({
      status: 200,
      body: {
        count: { ...committedCountResponse().count, status: 'cancelled' },
        reversals_created: 1,
        drift_count: 0,
        drift_products: 0,
      },
    });

    await renderAndWait();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /revert count/i }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/This will inverse/i)).not.toBeNull();
    });

    act(() => {
      fireEvent.change(
        screen.getByPlaceholderText(/Type "CONFIRM" to confirm/i),
        { target: { value: 'CONFIRM' } }
      );
    });

    const buttons = screen.getAllByRole('button', { name: /revert count/i });
    const confirmBtn = buttons[buttons.length - 1];
    act(() => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      const postCalls = fetchCalls.filter(
        (c) => c.url.endsWith('/revert') && c.method === 'POST'
      );
      expect(postCalls.length).toBe(1);
      expect(postCalls[0].body).toEqual({ confirmed_drift: false });
    });
    await waitFor(() => {
      expect(toastFns.success).toHaveBeenCalled();
    });
  });

  it('submits POST /revert with confirmed_drift=true when preview has drift', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => ({
      status: 200,
      body: driftedPreviewResponse(),
    });
    fetchHandlers['POST /api/admin/inventory/counts/count-1/revert'] = () => ({
      status: 200,
      body: {
        count: { ...committedCountResponse().count, status: 'cancelled' },
        reversals_created: 1,
        drift_count: 3,
        drift_products: 1,
      },
    });

    await renderAndWait();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /revert count/i }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/non-count adjustment/i)).not.toBeNull();
    });

    act(() => {
      fireEvent.change(
        screen.getByPlaceholderText(/Type "CONFIRM" to confirm/i),
        { target: { value: 'CONFIRM' } }
      );
    });

    const buttons = screen.getAllByRole('button', { name: /revert count/i });
    const confirmBtn = buttons[buttons.length - 1];
    act(() => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      const postCalls = fetchCalls.filter(
        (c) => c.url.endsWith('/revert') && c.method === 'POST'
      );
      expect(postCalls.length).toBe(1);
      expect(postCalls[0].body).toEqual({ confirmed_drift: true });
    });
  });

  it('shows error toast when revert API returns 400 drift-not-confirmed', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => ({
      status: 200,
      body: cleanPreviewResponse(),
    });
    fetchHandlers['POST /api/admin/inventory/counts/count-1/revert'] = () => ({
      status: 400,
      body: {
        error: 'Drift detected — confirm to proceed',
        requires_confirmation: true,
        drift_count: 2,
        drift_products: 1,
      },
    });

    await renderAndWait();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /revert count/i }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/This will inverse/i)).not.toBeNull();
    });
    act(() => {
      fireEvent.change(
        screen.getByPlaceholderText(/Type "CONFIRM" to confirm/i),
        { target: { value: 'CONFIRM' } }
      );
    });
    const buttons = screen.getAllByRole('button', { name: /revert count/i });
    act(() => {
      fireEvent.click(buttons[buttons.length - 1]);
    });

    await waitFor(() => {
      expect(toastFns.error).toHaveBeenCalled();
    });
  });
});

describe('Cancelled view — notes display (Session 42K)', () => {
  it('renders notes paragraph when count is cancelled and has notes', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1'] = () => {
      const fixture = committedCountResponse();
      fixture.count.status = 'cancelled';
      fixture.count.cancelled_by = 'emp-3';
      fixture.count.cancelled_at = '2026-04-24T10:00:00Z';
      fixture.count.cancelled_by_employee = { id: 'emp-3', first_name: 'Carol', last_name: 'Reverter' };
      // Force the notes into the fixture even though TS type says null.
      (fixture.count as unknown as { notes: string | null }).notes =
        'Reverted 2026-04-24 10:00 PST. 3 adjustment(s) inversed.';
      return { status: 200, body: fixture };
    };
    await renderAndWait();
    expect(screen.queryByText(/Reverted 2026-04-24/)).not.toBeNull();
  });

  it('omits notes paragraph when count is cancelled and notes is null', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1'] = () => {
      const fixture = committedCountResponse();
      fixture.count.status = 'cancelled';
      fixture.count.cancelled_by = 'emp-3';
      fixture.count.cancelled_at = '2026-04-24T10:00:00Z';
      fixture.count.cancelled_by_employee = { id: 'emp-3', first_name: 'Carol', last_name: 'Reverter' };
      return { status: 200, body: fixture };
    };
    await renderAndWait();
    // No notes div — search for the italic styling class would be fragile;
    // instead assert that no paragraph with the known reversal prefix is
    // present.
    expect(screen.queryByText(/Reverted/)).toBeNull();
  });
});

describe('Revert flow — blocked-negative mode (Session 42K-patch-1)', () => {
  it('renders red banner with product list and Recheck button when projected_negative_products is non-empty', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => ({
      status: 200,
      body: negativePreviewResponse(),
    });
    await renderAndWait();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /revert count/i }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/Cannot revert/i)).not.toBeNull();
    });
    expect(screen.queryByText(/would have negative quantity/i)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /^Recheck$/i })).not.toBeNull();
    // Disabled "Revert Count" confirm button + Cancel button
    const buttons = screen.getAllByRole('button', { name: /revert count/i });
    const confirmBtn = buttons[buttons.length - 1] as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    // Type-to-confirm input is hidden in blocked mode.
    expect(screen.queryByPlaceholderText(/Type "CONFIRM" to confirm/i)).toBeNull();
  });

  it('product link in red banner has target="_blank" and correct href', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => ({
      status: 200,
      body: negativePreviewResponse(),
    });
    await renderAndWait();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /revert count/i }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/Cannot revert/i)).not.toBeNull();
    });
    const link = screen.getByRole('link', { name: /Widget A/i }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/admin/catalog/products/p1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('Recheck button triggers a fresh preview fetch', async () => {
    let previewCallCount = 0;
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => {
      previewCallCount += 1;
      return { status: 200, body: negativePreviewResponse() };
    };
    await renderAndWait();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /revert count/i }));
    });
    await waitFor(() => {
      expect(previewCallCount).toBe(1);
    });
    const recheck = screen.getByRole('button', { name: /^Recheck$/i });
    act(() => {
      fireEvent.click(recheck);
    });
    await waitFor(() => {
      expect(previewCallCount).toBe(2);
    });
  });

  it('transitions to normal mode when Recheck returns clean preview after admin fixes quantities', async () => {
    let call = 0;
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => {
      call += 1;
      return {
        status: 200,
        body: call === 1 ? negativePreviewResponse() : cleanPreviewResponse(),
      };
    };
    await renderAndWait();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /revert count/i }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/Cannot revert/i)).not.toBeNull();
    });
    const recheck = screen.getByRole('button', { name: /^Recheck$/i });
    act(() => {
      fireEvent.click(recheck);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Cannot revert/i)).toBeNull();
      expect(screen.queryByText(/This will inverse/i)).not.toBeNull();
    });
    // Type-to-confirm input is back.
    expect(screen.queryByPlaceholderText(/Type "CONFIRM" to confirm/i)).not.toBeNull();
  });

  it('handles 409 NEGATIVE_QUANTITY response from /revert by re-rendering banner', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => ({
      status: 200,
      body: cleanPreviewResponse(),
    });
    fetchHandlers['POST /api/admin/inventory/counts/count-1/revert'] = () => ({
      status: 409,
      body: {
        error: 'NEGATIVE_QUANTITY',
        message: 'Revert would set negative quantity',
        problem_products: [
          {
            product_id: 'p1',
            name: 'Widget A',
            sku: 'W-A',
            current_qty: 2,
            target_qty: -3,
          },
        ],
      },
    });

    await renderAndWait();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /revert count/i }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/This will inverse/i)).not.toBeNull();
    });
    act(() => {
      fireEvent.change(
        screen.getByPlaceholderText(/Type "CONFIRM" to confirm/i),
        { target: { value: 'CONFIRM' } }
      );
    });
    const buttons = screen.getAllByRole('button', { name: /revert count/i });
    act(() => {
      fireEvent.click(buttons[buttons.length - 1]);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Cannot revert/i)).not.toBeNull();
    });
    expect(toastFns.error).toHaveBeenCalled();
  });
});

describe('Revert flow — blocked-stale mode (Session 42K-patch-1)', () => {
  it('renders gray info message when preview returns revertable=false', async () => {
    fetchHandlers['/api/admin/inventory/counts/count-1/revert-preview'] = () => ({
      status: 200,
      body: stalePreviewResponse(),
    });
    await renderAndWait();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /revert count/i }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/no longer in a revertable state/i)).not.toBeNull();
    });
    // Cancel button label is "Close" in stale mode.
    expect(screen.queryByRole('button', { name: /^Close$/i })).not.toBeNull();
    // Type-to-confirm input is hidden.
    expect(screen.queryByPlaceholderText(/Type "CONFIRM" to confirm/i)).toBeNull();
    // Confirm button is disabled.
    const buttons = screen.getAllByRole('button', { name: /revert count/i });
    const confirmBtn = buttons[buttons.length - 1] as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });
});
