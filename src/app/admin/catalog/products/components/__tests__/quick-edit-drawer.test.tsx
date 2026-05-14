import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { Product } from '@/lib/supabase/types';

// Capture handles so individual tests can inspect and configure behavior.
const supabaseUpdateEq = vi.fn(async (_patch: Record<string, unknown>) => ({ error: null as unknown }));
const adminFetchMock = vi.fn();

// Conflict-check mock (drawer barcode field does a pre-save SELECT)
const conflictResponse = { data: null as { id: string; name: string } | null };
const toastFns = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  default: vi.fn(),
};
const permissionFlags = { granted: true as boolean };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (_table: string) => ({
      // Update path — price / cost / threshold / barcode writes all land here.
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, _id: string) => supabaseUpdateEq(patch),
      }),
      // Select path — barcode conflict check: .select().eq().neq().limit().maybeSingle()
      select: (_cols: string) => {
        const chain = {
          eq: () => chain,
          neq: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: conflictResponse.data, error: null }),
        };
        return chain;
      },
    }),
  }),
}));

vi.mock('@/lib/utils/admin-fetch', () => ({
  adminFetch: (...args: unknown[]) => adminFetchMock(...args),
}));

vi.mock('@/lib/hooks/use-permission', () => ({
  usePermission: () => ({ granted: permissionFlags.granted, loading: false }),
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

// Import AFTER mocks are registered.
import { QuickEditDrawer } from '../quick-edit-drawer';

function mockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    square_item_id: null,
    sku: 'SKU-1',
    name: 'Test Product',
    slug: 'test-product',
    description: null,
    category_id: null,
    vendor_id: null,
    // Phase Money-Unify-3: products columns are integer cents.
    cost_price_cents: 500,
    retail_price_cents: 1000,
    quantity_on_hand: 20,
    reorder_threshold: 3,
    min_order_qty: null,
    is_taxable: true,
    is_loyalty_eligible: false,
    image_url: null,
    image_alt: null,
    barcode: 'B-1',
    is_active: true,
    show_on_website: true,
    is_featured: false,
    website_sort_order: 0,
    weight: null,
    length: null,
    width: null,
    height: null,
    weight_unit: null,
    dimension_unit: null,
    sale_price: null,
    ...overrides,
  } as Product;
}

beforeEach(() => {
  supabaseUpdateEq.mockReset().mockResolvedValue({ error: null });
  adminFetchMock.mockReset();
  toastFns.success.mockReset();
  toastFns.error.mockReset();
  toastFns.info.mockReset();
  toastFns.warning.mockReset();
  toastFns.default.mockReset();
  permissionFlags.granted = true;
  conflictResponse.data = null;
});

afterEach(() => {
  cleanup();
});

describe('QuickEditDrawer', () => {
  it('renders fields populated from the product prop', () => {
    render(
      <QuickEditDrawer
        open={true}
        product={mockProduct()}
        onOpenChange={vi.fn()}
      />,
    );
    const barcodeInput = screen.getByLabelText('Barcode') as HTMLInputElement;
    const priceInput = screen.getByLabelText('Price') as HTMLInputElement;
    const costInput = screen.getByLabelText('Cost') as HTMLInputElement;
    const thresholdInput = screen.getByLabelText(/^Reorder Threshold$/) as HTMLInputElement;
    const qtyInput = screen.getByLabelText('Quantity on Hand') as HTMLInputElement;

    expect(barcodeInput.value).toBe('B-1');
    expect(priceInput.value).toBe('10.00');
    expect(costInput.value).toBe('5.00');
    expect(thresholdInput.value).toBe('3');
    expect(qtyInput.value).toBe('20');
    // Title + SKU in header (barcode moved out of header → into its own field above)
    expect(screen.getByText('Test Product')).toBeDefined();
    expect(screen.getByText(/SKU-1/)).toBeDefined();
  });

  it('hides the Cost field when inventory.view_costs is denied', () => {
    permissionFlags.granted = false;
    render(
      <QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />,
    );
    expect(screen.queryByLabelText('Cost')).toBeNull();
    expect(screen.getByLabelText('Price')).toBeDefined();
    expect(screen.getByLabelText(/^Reorder Threshold$/)).toBeDefined();
    expect(screen.getByLabelText('Quantity on Hand')).toBeDefined();
  });

  it('price blur triggers supabase update with the new value', async () => {
    render(<QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />);
    const priceInput = screen.getByLabelText('Price') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(priceInput, { target: { value: '12.50' } });
      fireEvent.blur(priceInput);
    });

    expect(supabaseUpdateEq).toHaveBeenCalledTimes(1);
    expect(supabaseUpdateEq).toHaveBeenCalledWith({ retail_price_cents: 1250 });
  });

  it('price save success fires a sonner toast with an action button', async () => {
    render(<QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />);
    const priceInput = screen.getByLabelText('Price') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(priceInput, { target: { value: '12.50' } });
      fireEvent.blur(priceInput);
    });

    expect(toastFns.success).toHaveBeenCalledTimes(1);
    const [, opts] = toastFns.success.mock.calls[0] as [string, { duration: number; action: { label: string; onClick: () => void } }];
    expect(opts.duration).toBe(5000);
    expect(opts.action.label).toBe('Undo');
    expect(typeof opts.action.onClick).toBe('function');
  });

  it('clicking Undo issues a second update reverting to the previous value', async () => {
    render(<QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />);
    const priceInput = screen.getByLabelText('Price') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(priceInput, { target: { value: '12.50' } });
      fireEvent.blur(priceInput);
    });

    const [, opts] = toastFns.success.mock.calls[0] as [string, { action: { onClick: () => void | Promise<void> } }];
    await act(async () => {
      await opts.action.onClick();
    });

    // Two updates total: initial set to 12.5, then undo back to 10.
    expect(supabaseUpdateEq).toHaveBeenCalledTimes(2);
    expect(supabaseUpdateEq.mock.calls[1][0]).toEqual({ retail_price_cents: 1000 });
  });

  it('qty change reveals the adjustment reason block; qty does NOT autosave on blur', async () => {
    render(<QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />);
    const qtyInput = screen.getByLabelText('Quantity on Hand') as HTMLInputElement;

    expect(screen.queryByText(/Save Quantity Change/)).toBeNull();

    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '17' } });
      fireEvent.blur(qtyInput);
    });

    // Adjustment block appears.
    expect(screen.getByText(/Adjustment: -3/)).toBeDefined();
    expect(screen.getByText(/Save Quantity Change/)).toBeDefined();
    // No save call was issued on blur.
    expect(adminFetchMock).not.toHaveBeenCalled();
    expect(supabaseUpdateEq).not.toHaveBeenCalled();
  });

  it('qty Save button is disabled until a reason category is chosen', async () => {
    render(<QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />);
    const qtyInput = screen.getByLabelText('Quantity on Hand') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '17' } });
    });

    const saveBtn = screen.getByRole('button', { name: /Save Quantity Change/ }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    const reasonSelect = screen.getByLabelText(/Reason category/) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(reasonSelect, { target: { value: 'damaged' } });
    });
    expect(saveBtn.disabled).toBe(false);
  });

  it('qty save calls /api/admin/stock-adjustments with the signed delta and category + notes reason', async () => {
    adminFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { quantity_after: 17 } }),
    });

    render(<QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />);
    const qtyInput = screen.getByLabelText('Quantity on Hand') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '17' } });
    });

    const reasonSelect = screen.getByLabelText(/Reason category/) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(reasonSelect, { target: { value: 'damaged' } });
    });

    const notes = screen.getByLabelText(/Notes/) as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(notes, { target: { value: 'Bumped by customer' } });
    });

    const saveBtn = screen.getByRole('button', { name: /Save Quantity Change/ });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(adminFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = adminFetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/stock-adjustments');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      product_id: 'p-1',
      adjustment: -3,
      reason: 'Damaged — Bumped by customer',
      adjustment_type: 'damaged',
    });

    // Supabase update was NOT called for products.quantity_on_hand.
    expect(supabaseUpdateEq).not.toHaveBeenCalled();

    // Success toast without an Undo action (qty changes have no undo).
    expect(toastFns.success).toHaveBeenCalledTimes(1);
    const [, opts] = toastFns.success.mock.calls[0] as [string, unknown];
    expect(opts).toBeUndefined();
  });

  it('qty save with category only (no notes) uses just the category label as reason', async () => {
    adminFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { quantity_after: 25 } }),
    });

    render(<QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />);
    const qtyInput = screen.getByLabelText('Quantity on Hand') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '25' } });
    });
    const reasonSelect = screen.getByLabelText(/Reason category/) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(reasonSelect, { target: { value: 'recount' } });
    });

    const saveBtn = screen.getByRole('button', { name: /Save Quantity Change/ });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    const [, init] = adminFetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.reason).toBe('Recount');
    expect(body.adjustment).toBe(5);
    expect(body.adjustment_type).toBe('recount');
  });

  // ---------- Session 41C — barcode field tests ----------

  it('barcode field renders as first editable field and populates from the product', () => {
    render(<QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />);
    const barcodeInput = screen.getByLabelText('Barcode') as HTMLInputElement;
    expect(barcodeInput.value).toBe('B-1');
  });

  it('barcode blur triggers supabase update with the trimmed new value', async () => {
    render(<QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />);
    const barcodeInput = screen.getByLabelText('Barcode') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(barcodeInput, { target: { value: '  NEWCODE-999  ' } });
      fireEvent.blur(barcodeInput);
    });

    expect(supabaseUpdateEq).toHaveBeenCalledTimes(1);
    expect(supabaseUpdateEq).toHaveBeenCalledWith({ barcode: 'NEWCODE-999' });
    expect(toastFns.success).toHaveBeenCalledTimes(1);
    const [, opts] = toastFns.success.mock.calls[0] as [string, { action: { label: string } }];
    expect(opts.action.label).toBe('Undo');
  });

  it('clearing the barcode saves null, not an empty string', async () => {
    render(<QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />);
    const barcodeInput = screen.getByLabelText('Barcode') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(barcodeInput, { target: { value: '' } });
      fireEvent.blur(barcodeInput);
    });

    expect(supabaseUpdateEq).toHaveBeenCalledTimes(1);
    expect(supabaseUpdateEq).toHaveBeenCalledWith({ barcode: null });
  });

  it('conflict check: another product owns the barcode → error toast, no update, field reverts', async () => {
    // Conflict pre-check returns a hit.
    conflictResponse.data = { id: 'p-other', name: 'Other Product' };

    render(<QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />);
    const barcodeInput = screen.getByLabelText('Barcode') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(barcodeInput, { target: { value: 'DUPLICATE' } });
      fireEvent.blur(barcodeInput);
    });

    expect(toastFns.error).toHaveBeenCalledTimes(1);
    expect(toastFns.error.mock.calls[0][0]).toBe('Barcode already assigned to Other Product');
    // No UPDATE was issued.
    expect(supabaseUpdateEq).not.toHaveBeenCalled();
    // Field reverted to the prior barcode.
    expect(barcodeInput.value).toBe('B-1');
  });

  it('undo reverts the barcode via a second supabase update', async () => {
    render(<QuickEditDrawer open={true} product={mockProduct()} onOpenChange={vi.fn()} />);
    const barcodeInput = screen.getByLabelText('Barcode') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(barcodeInput, { target: { value: 'SWAPPED' } });
      fireEvent.blur(barcodeInput);
    });

    const [, opts] = toastFns.success.mock.calls[0] as [string, { action: { onClick: () => void | Promise<void> } }];
    await act(async () => {
      await opts.action.onClick();
    });

    expect(supabaseUpdateEq).toHaveBeenCalledTimes(2);
    expect(supabaseUpdateEq.mock.calls[1][0]).toEqual({ barcode: 'B-1' });
  });
});
