import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

// --- Mocks (registered BEFORE the SUT import) -------------------------

const routerMock = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() };
const paramsMock = { id: 'count-1' };

vi.mock('next/navigation', () => ({
  useParams: () => paramsMock,
  useRouter: () => routerMock,
}));

const toastFns = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => {
  const toast = Object.assign(
    (msg: string) => msg,
    {
      success: (msg: string) => toastFns.success(msg),
      error: (msg: string) => toastFns.error(msg),
    },
  );
  return { toast };
});

// Capture the onScan callback so tests can simulate scans.
const scannerState: {
  onScan: ((barcode: string) => void | Promise<void>) | null;
  enabled: boolean;
} = { onScan: null, enabled: false };

vi.mock('@/lib/hooks/use-barcode-scanner', () => ({
  useBarcodeScanner: (opts: {
    onScan: (barcode: string) => void | Promise<void>;
    enabled?: boolean;
    requireTargetAttribute?: boolean;
  }) => {
    scannerState.enabled = opts.enabled !== false;
    scannerState.onScan = scannerState.enabled ? opts.onScan : null;
  },
}));

// adminFetch mock — dispatches by URL.
type FetchResponse = { status: number; body: unknown };
const fetchHandlers: Record<string, (init?: RequestInit) => FetchResponse> = {};
const fetchCalls: Array<{ url: string; method: string; body: unknown }> = [];

vi.mock('@/lib/utils/admin-fetch', () => ({
  adminFetch: async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    let parsed: unknown = undefined;
    if (init?.body && typeof init.body === 'string') {
      try { parsed = JSON.parse(init.body); } catch { /* ignore */ }
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

// Import AFTER mocks are registered.
import Page from '../[id]/page';

// --- Fixtures ---------------------------------------------------------

interface CountFixture {
  status: 'active' | 'review' | 'committed' | 'cancelled';
  items?: Array<{
    id: string;
    product_id: string;
    expected_qty: number;
    counted_qty: number;
    product_name: string;
  }>;
}

function countResponse(fix: CountFixture) {
  return {
    count: {
      id: 'count-1',
      status: fix.status,
      count_type: 'sectional',
      section_label: 'Test Shelf',
      notes: null,
      started_by: 'emp-1',
      started_at: '2026-04-21T10:00:00Z',
      committed_by: null,
      committed_at: null,
      cancelled_by: null,
      cancelled_at: null,
      started_by_employee: { id: 'emp-1', first_name: 'Alice', last_name: 'Tester' },
      committed_by_employee: null,
      cancelled_by_employee: null,
    },
    items: (fix.items ?? []).map((it) => ({
      id: it.id,
      stock_count_id: 'count-1',
      product_id: it.product_id,
      expected_qty: it.expected_qty,
      counted_qty: it.counted_qty,
      last_updated_by: 'emp-1',
      updated_at: '2026-04-21T10:01:00Z',
      product: {
        id: it.product_id,
        name: it.product_name,
        sku: `SKU-${it.product_id}`,
        barcode: `B-${it.product_id}`,
        image_url: null,
      },
      last_updated_by_employee: { id: 'emp-1', first_name: 'Alice', last_name: 'Tester' },
    })),
  };
}

function stubGet(fix: CountFixture) {
  fetchHandlers['GET /api/admin/inventory/counts/count-1'] = () => ({
    status: 200,
    body: countResponse(fix),
  });
}

// --- Lifecycle --------------------------------------------------------

beforeEach(() => {
  routerMock.push.mockReset();
  toastFns.success.mockReset();
  toastFns.error.mockReset();
  scannerState.onScan = null;
  scannerState.enabled = false;
  fetchCalls.length = 0;
  for (const k of Object.keys(fetchHandlers)) delete fetchHandlers[k];
});

afterEach(() => {
  cleanup();
});

async function renderAndWait() {
  render(<Page />);
  await waitFor(() => expect(screen.queryByText(/Count:/)).not.toBeNull());
}

// --- Tests ------------------------------------------------------------

describe('CountDetailPage', () => {
  it('scan triggers POST /items with increment=1', async () => {
    stubGet({
      status: 'active',
      items: [],
    });
    // After the scan, loadCount re-fires: serve the updated state.
    let loadCalls = 0;
    fetchHandlers['GET /api/admin/inventory/counts/count-1'] = () => {
      loadCalls++;
      return {
        status: 200,
        body: countResponse({
          status: 'active',
          items: loadCalls >= 2
            ? [{ id: 'line-1', product_id: 'prod-1', expected_qty: 5, counted_qty: 1, product_name: 'Widget' }]
            : [],
        }),
      };
    };
    fetchHandlers['POST /api/admin/products/barcode-lookup'] = () => ({
      status: 200,
      body: { product: { id: 'prod-1', name: 'Widget' } },
    });
    fetchHandlers['POST /api/admin/inventory/counts/count-1/items'] = () => ({
      status: 201,
      body: {
        item: {
          id: 'line-1',
          product_id: 'prod-1',
          expected_qty: 5,
          counted_qty: 1,
          last_updated_by: 'emp-1',
          updated_at: '2026-04-21T10:02:00Z',
          product: null,
          last_updated_by_employee: null,
        },
      },
    });

    await renderAndWait();

    expect(scannerState.enabled).toBe(true);
    expect(scannerState.onScan).not.toBeNull();

    await act(async () => {
      await scannerState.onScan!('B-PROD-1');
    });

    const itemsCall = fetchCalls.find(
      (c) => c.url === '/api/admin/inventory/counts/count-1/items' && c.method === 'POST'
    );
    expect(itemsCall).toBeDefined();
    expect(itemsCall!.body).toEqual({ product_id: 'prod-1', increment: 1 });
    expect(toastFns.success).toHaveBeenCalled();
  });

  it('manual qty edit commits via POST /items with set_to=N', async () => {
    stubGet({
      status: 'active',
      items: [{ id: 'line-1', product_id: 'prod-1', expected_qty: 5, counted_qty: 1, product_name: 'Widget' }],
    });
    fetchHandlers['POST /api/admin/inventory/counts/count-1/items'] = () => ({
      status: 200,
      body: {
        item: {
          id: 'line-1',
          product_id: 'prod-1',
          expected_qty: 5,
          counted_qty: 7,
          last_updated_by: 'emp-1',
          updated_at: '2026-04-21T10:03:00Z',
          product: null,
          last_updated_by_employee: null,
        },
      },
    });

    await renderAndWait();

    // Counted cell is rendered as a blue button with the value "1". Click to enter edit.
    const cell = screen.getByRole('button', { name: '1' });
    fireEvent.click(cell);

    const input = screen.getByLabelText('Counted quantity for Widget') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '7' } });

    await act(async () => {
      fireEvent.blur(input);
    });

    const itemsCall = fetchCalls.find(
      (c) => c.url === '/api/admin/inventory/counts/count-1/items' && c.method === 'POST'
    );
    expect(itemsCall).toBeDefined();
    expect(itemsCall!.body).toEqual({ product_id: 'prod-1', set_to: 7 });
  });

  it('commit button opens the confirm modal with variance preview', async () => {
    stubGet({
      status: 'review',
      items: [
        { id: 'l1', product_id: 'p1', expected_qty: 5, counted_qty: 8, product_name: 'Widget A' },
        { id: 'l2', product_id: 'p2', expected_qty: 10, counted_qty: 7, product_name: 'Widget B' },
      ],
    });

    await renderAndWait();

    // Click Commit Count
    const commitBtn = screen.getByRole('button', { name: /commit count/i });
    fireEvent.click(commitBtn);

    // Modal should be visible with variance preview. Product names + deltas
    // appear in BOTH the items table and the modal's preview list, so we
    // use getAllByText and verify a minimum count.
    expect(screen.getByText(/commit this inventory count/i)).toBeDefined();
    expect(screen.getAllByText('Widget A').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Widget B').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('+3').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('-3').length).toBeGreaterThanOrEqual(2);
  });

  it('commit confirm click POSTs /commit and refetches', async () => {
    let getCalls = 0;
    fetchHandlers['GET /api/admin/inventory/counts/count-1'] = () => {
      getCalls++;
      const status = getCalls >= 2 ? 'committed' : 'review';
      return {
        status: 200,
        body: countResponse({
          status,
          items: [{ id: 'l1', product_id: 'p1', expected_qty: 5, counted_qty: 8, product_name: 'Widget A' }],
        }),
      };
    };
    fetchHandlers['POST /api/admin/inventory/counts/count-1/commit'] = () => ({
      status: 200,
      body: { count: {}, adjustments_created: 1 },
    });

    await renderAndWait();

    fireEvent.click(screen.getByRole('button', { name: /commit count/i }));
    const confirmBtn = screen.getByRole('button', { name: /^commit$/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    const commitCall = fetchCalls.find(
      (c) => c.url === '/api/admin/inventory/counts/count-1/commit' && c.method === 'POST'
    );
    expect(commitCall).toBeDefined();
    expect(toastFns.success).toHaveBeenCalledWith(expect.stringMatching(/committed/i));
    // Refetch fired → getCalls >= 2
    expect(getCalls).toBeGreaterThanOrEqual(2);
  });

  it('renders different view for review status — scanner disabled, Commit button shown', async () => {
    stubGet({
      status: 'review',
      items: [{ id: 'l1', product_id: 'p1', expected_qty: 5, counted_qty: 6, product_name: 'Widget' }],
    });

    await renderAndWait();

    // Scanner disabled
    expect(scannerState.enabled).toBe(false);
    expect(scannerState.onScan).toBeNull();
    // Commit button present (only visible in review)
    expect(screen.getByRole('button', { name: /commit count/i })).toBeDefined();
    // Move to Review button NOT present (would be visible in active)
    expect(screen.queryByRole('button', { name: /move to review/i })).toBeNull();
    // Scan bar NOT shown (active-only)
    expect(screen.queryByText(/ready to scan/i)).toBeNull();
  });

  it('variance filter toggle in review state hides zero-variance rows', async () => {
    stubGet({
      status: 'review',
      items: [
        { id: 'l1', product_id: 'p1', expected_qty: 5, counted_qty: 8, product_name: 'Variance Widget' },
        { id: 'l2', product_id: 'p2', expected_qty: 3, counted_qty: 3, product_name: 'Exact Widget' },
      ],
    });

    await renderAndWait();

    // Default: varianceOnly=true → only the off-count row renders
    expect(screen.getByText('Variance Widget')).toBeDefined();
    expect(screen.queryByText('Exact Widget')).toBeNull();

    // Toggle off the filter
    const toggle = screen.getByLabelText(/variances only/i);
    fireEvent.click(toggle);

    // Both rows render now
    expect(screen.getByText('Variance Widget')).toBeDefined();
    expect(screen.getByText('Exact Widget')).toBeDefined();
  });
});

describe('CountDetailPage — 42D-patch fixes', () => {
  // Scanning mid-edit triggers blur first (saves set_to) then the scanner's
  // own increment POST. Two POSTs to /items in order.
  it('scan during qty edit blurs first → set_to POSTs before increment POST', async () => {
    let getCalls = 0;
    fetchHandlers['GET /api/admin/inventory/counts/count-1'] = () => {
      getCalls++;
      return {
        status: 200,
        body: countResponse({
          status: 'active',
          items: [
            { id: 'l1', product_id: 'p1', expected_qty: 3, counted_qty: 3, product_name: 'Widget' },
          ],
        }),
      };
    };
    fetchHandlers['POST /api/admin/products/barcode-lookup'] = () => ({
      status: 200,
      body: { product: { id: 'p1', name: 'Widget' } },
    });
    fetchHandlers['POST /api/admin/inventory/counts/count-1/items'] = () => ({
      status: 200,
      body: {
        item: {
          id: 'l1',
          product_id: 'p1',
          expected_qty: 3,
          counted_qty: 0, // mock doesn't matter for this test
          last_updated_by: 'emp-1',
          updated_at: '2026-04-21T10:05:00Z',
          product: null,
          last_updated_by_employee: null,
        },
      },
    });

    await renderAndWait();

    // Enter edit mode on the qty cell, type a new value.
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    const input = screen.getByLabelText('Counted quantity for Widget') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: '7' } });
    expect(document.activeElement).toBe(input);

    // Scan the same product BEFORE the user has blurred. The onScan handler
    // should blur the input first (→ onBlur → commitEdit → set_to=7), then
    // run the scan's own POST (increment=1).
    await act(async () => {
      await scannerState.onScan!('B-p1');
    });

    // Two POSTs to /items, both present, set_to BEFORE increment.
    const itemsPosts = fetchCalls.filter(
      (c) => c.url === '/api/admin/inventory/counts/count-1/items' && c.method === 'POST'
    );
    expect(itemsPosts.length).toBe(2);

    const setToBody = itemsPosts[0].body as { product_id: string; set_to?: number };
    expect(setToBody.product_id).toBe('p1');
    expect(setToBody.set_to).toBe(7);

    const incBody = itemsPosts[1].body as { product_id: string; increment?: number };
    expect(incBody.product_id).toBe('p1');
    expect(incBody.increment).toBe(1);
  });

  // Regression: removing data-barcode-scan-target from the search input means
  // the rendered DOM no longer carries the opt-out attribute. The real hook
  // test covers the routing behavior; this test verifies the attribute is gone
  // at the page level so the hook sees a "normal" focused input.
  it('search input does NOT carry data-barcode-scan-target', async () => {
    stubGet({ status: 'active', items: [] });
    await renderAndWait();

    const searchInput = screen.getByPlaceholderText(/search by product name/i) as HTMLInputElement;
    expect(searchInput.getAttribute('data-barcode-scan-target')).toBeNull();
  });

  // Inline qty edit input carries inputMode="numeric" so iPad opens the
  // compact numeric keypad instead of full QWERTY (verified already present
  // from 42D-2; this guards against future regression).
  it('inline qty-edit input renders with inputMode="numeric"', async () => {
    stubGet({
      status: 'active',
      items: [
        { id: 'l1', product_id: 'p1', expected_qty: 3, counted_qty: 3, product_name: 'Widget' },
      ],
    });
    await renderAndWait();

    fireEvent.click(screen.getByRole('button', { name: '3' }));
    const input = screen.getByLabelText('Counted quantity for Widget') as HTMLInputElement;
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('pattern')).toBe('[0-9]*');
    expect(input.dataset.qtyEditInput).toBe('true');
  });
});
