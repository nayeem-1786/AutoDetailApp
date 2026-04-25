import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import type { StockAdjustment } from '@/lib/supabase/types';

// Session 42T — StockHistoryCard component tests. The card lives in the
// product detail page file (exported as a named export) to avoid a new file
// just for testability. Because importing from that file pulls in the whole
// product page module graph, we stub the heavy deps first.

const adminFetchMock = vi.fn();
const routerPushMock = vi.fn();
const permissionFlags = { granted: true as boolean, loading: false as boolean };

const toastFns = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  default: vi.fn(),
};

vi.mock('@/lib/utils/admin-fetch', () => ({
  adminFetch: (...args: unknown[]) => adminFetchMock(...args),
}));

vi.mock('@/lib/hooks/use-permission', () => ({
  usePermission: () => ({ granted: permissionFlags.granted, loading: permissionFlags.loading }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
  useParams: () => ({ id: 'p-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => {
  const toast = Object.assign(
    (msg: string, opts?: unknown) => toastFns.default(msg, opts),
    {
      success: (msg: string, opts?: unknown) => toastFns.success(msg, opts),
      error: (msg: string, opts?: unknown) => toastFns.error(msg, opts),
      info: (msg: string, opts?: unknown) => toastFns.info(msg, opts),
      warning: (msg: string, opts?: unknown) => toastFns.warning(msg, opts),
    },
  );
  return { toast };
});

// ReceiptDialog is permissioned & does its own fetch — stub to a simple marker.
vi.mock('@/components/admin/receipt-dialog', () => ({
  ReceiptDialog: ({ open, transactionId }: { open: boolean; transactionId: string | null }) =>
    open ? <div data-testid="receipt-dialog">tx:{transactionId}</div> : null,
}));

// Supabase client is pulled in via the product page module graph but not
// exercised by StockHistoryCard itself. Stub it so module load is inert.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

// Import AFTER mocks are registered.
import { StockHistoryCard } from '../page';

function makeAdjustment(overrides: Partial<StockAdjustment> = {}): StockAdjustment {
  return {
    id: 'sa-1',
    product_id: 'p-1',
    adjustment_type: 'sold',
    quantity_change: -1,
    quantity_before: 5,
    quantity_after: 4,
    reason: 'Sold at POS',
    reference_id: 'tx-1',
    reference_type: 'transaction',
    created_by: 'e-1',
    created_at: '2026-04-24T10:00:00Z',
    created_by_employee: { id: 'e-1', first_name: 'Ada', last_name: 'Lovelace' },
    ...overrides,
  } as StockAdjustment;
}

function respond(adjustments: StockAdjustment[], total?: number) {
  return {
    ok: true,
    json: async () => ({ data: adjustments, total: total ?? adjustments.length }),
  };
}

beforeEach(() => {
  adminFetchMock.mockReset();
  routerPushMock.mockReset();
  Object.values(toastFns).forEach((fn) => fn.mockReset());
  permissionFlags.granted = true;
  permissionFlags.loading = false;
});

afterEach(() => {
  cleanup();
});

describe('StockHistoryCard', () => {
  it('renders a row per fetched adjustment with the correct label (incl. shop_use)', async () => {
    adminFetchMock.mockResolvedValueOnce(
      respond([
        makeAdjustment({ id: 'sa-1', adjustment_type: 'sold', reason: 'POS sale' }),
        makeAdjustment({
          id: 'sa-2',
          adjustment_type: 'shop_use',
          reason: 'Used a microfiber',
          quantity_change: -1,
          reference_type: 'shop_use',
          reference_id: null,
        }),
      ]),
    );

    await act(async () => {
      render(<StockHistoryCard productId="p-1" />);
    });

    await waitFor(() => {
      // Both the dropdown <option> and the row Badge render the text, so
      // assert via getAllByText to avoid the "multiple matches" throw.
      expect(screen.getAllByText('Sold').length).toBeGreaterThan(0);
    });
    // The new label for shop_use must render as "Shop Use", not raw string.
    expect(screen.getAllByText('Shop Use').length).toBeGreaterThan(0);
    expect(screen.getByText('POS sale')).toBeDefined();
    expect(screen.getByText('Used a microfiber')).toBeDefined();
  });

  it('selecting a type filter re-fetches with type=<selected>', async () => {
    adminFetchMock.mockResolvedValue(respond([makeAdjustment()]));

    await act(async () => {
      render(<StockHistoryCard productId="p-1" />);
    });
    await waitFor(() => expect(adminFetchMock).toHaveBeenCalled());

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'damaged' } });
    });

    await waitFor(() => {
      const lastCallUrl = adminFetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCallUrl).toContain('type=damaged');
      expect(lastCallUrl).toContain('product_id=p-1');
    });
  });

  it('Next pagination increments offset by 50', async () => {
    // Total 75 → 2 pages of size 50.
    adminFetchMock.mockResolvedValue(respond([makeAdjustment()], 75));

    await act(async () => {
      render(<StockHistoryCard productId="p-1" />);
    });
    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeDefined());

    const nextBtn = screen.getByRole('button', { name: /Next/i });
    await act(async () => {
      fireEvent.click(nextBtn);
    });

    await waitFor(() => {
      const lastCallUrl = adminFetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCallUrl).toContain('offset=50');
    });
    expect(screen.getByText('Page 2 of 2')).toBeDefined();
  });

  it('hides the card when inventory.view_stock permission is denied', async () => {
    permissionFlags.granted = false;
    const { container } = render(<StockHistoryCard productId="p-1" />);
    // Permission denied → return null, card does not render, fetch not called.
    expect(container.firstChild).toBeNull();
    expect(adminFetchMock).not.toHaveBeenCalled();
  });

  it('reference column: PO link, stock_count link, transaction View Receipt, shop_use --', async () => {
    adminFetchMock.mockResolvedValueOnce(
      respond([
        makeAdjustment({
          id: 'sa-po',
          adjustment_type: 'received',
          reference_type: 'purchase_order',
          reference_id: 'po-42',
          reason: 'PO receipt',
        }),
        makeAdjustment({
          id: 'sa-count',
          adjustment_type: 'recount',
          reference_type: 'stock_count',
          reference_id: 'count-7',
          reason: 'Count commit',
        }),
        makeAdjustment({
          id: 'sa-tx',
          adjustment_type: 'sold',
          reference_type: 'transaction',
          reference_id: 'tx-99',
          reason: 'POS sale',
        }),
        makeAdjustment({
          id: 'sa-shop',
          adjustment_type: 'shop_use',
          reference_type: 'shop_use',
          reference_id: null,
          reason: 'Shop use',
        }),
      ]),
    );

    await act(async () => {
      render(<StockHistoryCard productId="p-1" />);
    });

    await waitFor(() => expect(screen.getByText('View PO')).toBeDefined());
    expect(screen.getByText('View Count')).toBeDefined();
    expect(screen.getByText('View Receipt')).toBeDefined();

    // PO button navigates to PO detail.
    fireEvent.click(screen.getByText('View PO'));
    expect(routerPushMock).toHaveBeenCalledWith('/admin/inventory/purchase-orders/po-42');

    // Stock count button navigates to count detail.
    fireEvent.click(screen.getByText('View Count'));
    expect(routerPushMock).toHaveBeenCalledWith('/admin/inventory/counts/count-7');

    // Transaction button opens the receipt dialog (stubbed).
    fireEvent.click(screen.getByText('View Receipt'));
    await waitFor(() => {
      expect(screen.getByTestId('receipt-dialog').textContent).toBe('tx:tx-99');
    });
  });
});
