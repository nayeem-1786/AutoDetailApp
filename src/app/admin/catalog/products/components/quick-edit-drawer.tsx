'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { SlideOver } from '@/components/ui/slide-over';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { usePermission } from '@/lib/hooks/use-permission';
import { formatCurrency, formatMoney, formatMoneyForInput } from '@/lib/utils/format';
import { fromCents, toCents } from '@/lib/utils/money';
import type { Product } from '@/lib/supabase/types';

// Shared props for the in-input clear-X button. `onMouseDown` preventDefault
// is load-bearing: without it, clicking the button steals focus from the
// input BEFORE our onClick fires, which triggers the input's onBlur handler
// with the pre-click value — the onBlur save path would then persist the
// not-yet-cleared value. preventDefault on mousedown keeps focus on the
// input; onClick then mutates state; onBlur fires naturally when the user
// next taps away.
const CLEAR_BUTTON_CLASS =
  'absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ui-text-dim hover:text-ui-text-muted';

interface QuickEditDrawerProps {
  open: boolean;
  product: Product | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (updated: Product) => void;
}

type QtyReason = 'manual' | 'recount' | 'damaged' | 'shop_use';

const QTY_REASON_OPTIONS: { value: QtyReason; label: string }[] = [
  { value: 'manual', label: 'Manual adjustment' },
  { value: 'recount', label: 'Recount' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'shop_use', label: 'Shop use' },
];

// Phase Money-Unify-3: input edit fields accept integer cents and render via
// formatMoneyForInput (e.g. cents=1000 → "10.00"). parsePrice converts user
// keystrokes back to integer cents via toCents().
function formatPriceCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '';
  return formatMoneyForInput(cents);
}
function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return String(n);
}

// Parse dollar-string input → integer cents. Returns null on invalid/empty/negative.
function parsePriceCents(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return toCents(n);
}
function parseInteger(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function QuickEditDrawer({
  open,
  product,
  onOpenChange,
  onSaved,
}: QuickEditDrawerProps) {
  const supabase = useMemo(() => createClient(), []);
  const { granted: canViewCost } = usePermission('inventory.view_costs');

  // Live snapshot of the row, mutated optimistically after each save.
  const [current, setCurrent] = useState<Product | null>(product);

  // Field draft strings (preserve trailing decimal / intermediate typing).
  const [barcodeStr, setBarcodeStr] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [costStr, setCostStr] = useState('');
  const [thresholdStr, setThresholdStr] = useState('');
  const [qtyStr, setQtyStr] = useState('');

  // Qty adjustment metadata (only submitted when qty differs).
  const [qtyReason, setQtyReason] = useState<QtyReason | ''>('');
  const [qtyNotes, setQtyNotes] = useState('');
  const [savingQty, setSavingQty] = useState(false);

  // Hydrate / rehydrate when the product prop changes.
  useEffect(() => {
    setCurrent(product);
    setBarcodeStr(product?.barcode ?? '');
    setPriceStr(formatPriceCents(product?.retail_price_cents));
    setCostStr(formatPriceCents(product?.cost_price_cents));
    setThresholdStr(formatInt(product?.reorder_threshold));
    setQtyStr(formatInt(product?.quantity_on_hand));
    setQtyReason('');
    setQtyNotes('');
  }, [product?.id, product?.barcode, product?.retail_price_cents, product?.cost_price_cents, product?.reorder_threshold, product?.quantity_on_hand]);

  // Shared autosave helper for price/cost/threshold.
  const saveField = useCallback(
    async (
      field: 'retail_price_cents' | 'cost_price_cents' | 'reorder_threshold',
      newValue: number | null,
      label: string,
      displayValue: string,
    ) => {
      if (!current) return;
      const oldValue = current[field] as number | null;
      if (oldValue === newValue) return;

      // Optimistic update.
      setCurrent((prev) => (prev ? { ...prev, [field]: newValue } as Product : prev));

      const { error } = await supabase
        .from('products')
        .update({ [field]: newValue })
        .eq('id', current.id);

      if (error) {
        setCurrent((prev) => (prev ? { ...prev, [field]: oldValue } as Product : prev));
        // Re-hydrate the draft string to the prior value so the user sees the revert.
        if (field === 'retail_price_cents') setPriceStr(formatPriceCents(oldValue));
        else if (field === 'cost_price_cents') setCostStr(formatPriceCents(oldValue));
        else setThresholdStr(formatInt(oldValue));
        toast.error(`Save failed: ${error.message}`);
        return;
      }

      onSaved?.({ ...current, [field]: newValue } as Product);

      toast.success(`${label} updated — ${displayValue}`, {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: async () => {
            setCurrent((prev) => (prev ? { ...prev, [field]: oldValue } as Product : prev));
            if (field === 'retail_price_cents') setPriceStr(formatPriceCents(oldValue));
            else if (field === 'cost_price_cents') setCostStr(formatPriceCents(oldValue));
            else setThresholdStr(formatInt(oldValue));

            const { error: undoErr } = await supabase
              .from('products')
              .update({ [field]: oldValue })
              .eq('id', current.id);

            if (undoErr) {
              toast.error(`Undo failed: ${undoErr.message}`);
              return;
            }
            onSaved?.({ ...current, [field]: oldValue } as Product);
            const reverted = field === 'reorder_threshold' ? formatInt(oldValue) : (oldValue != null ? formatMoney(oldValue) : '—');
            toast(`Reverted to ${reverted}`);
          },
        },
      });
    },
    [current, supabase, onSaved],
  );

  async function handleBarcodeBlur() {
    if (!current) return;
    const raw = barcodeStr.trim();
    const next = raw === '' ? null : raw;
    const oldValue = current.barcode;
    if (next === oldValue) {
      // Normalize the input so lingering whitespace doesn't stay visible.
      setBarcodeStr(oldValue ?? '');
      return;
    }

    // Soft conflict check — no DB unique constraint exists, so another
    // product could have this barcode. Surface it before writing.
    if (next !== null) {
      const { data: conflict } = await supabase
        .from('products')
        .select('id, name')
        .eq('barcode', next)
        .neq('id', current.id)
        .limit(1)
        .maybeSingle();
      if (conflict) {
        setBarcodeStr(oldValue ?? '');
        toast.error(`Barcode already assigned to ${conflict.name}`);
        return;
      }
    }

    // Optimistic update.
    setCurrent((prev) => (prev ? { ...prev, barcode: next } as Product : prev));

    const { error } = await supabase
      .from('products')
      .update({ barcode: next })
      .eq('id', current.id);

    if (error) {
      setCurrent((prev) => (prev ? { ...prev, barcode: oldValue } as Product : prev));
      setBarcodeStr(oldValue ?? '');
      toast.error(`Save failed: ${error.message}`);
      return;
    }

    onSaved?.({ ...current, barcode: next } as Product);

    const display = next === null ? 'cleared' : next;
    toast.success(`Barcode updated — ${display}`, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: async () => {
          setCurrent((prev) => (prev ? { ...prev, barcode: oldValue } as Product : prev));
          setBarcodeStr(oldValue ?? '');

          const { error: undoErr } = await supabase
            .from('products')
            .update({ barcode: oldValue })
            .eq('id', current.id);

          if (undoErr) {
            toast.error(`Undo failed: ${undoErr.message}`);
            return;
          }
          onSaved?.({ ...current, barcode: oldValue } as Product);
          toast(`Reverted to ${oldValue ?? 'no barcode'}`);
        },
      },
    });
  }

  async function handlePriceBlur() {
    const next = parsePriceCents(priceStr);
    if (next === null) {
      // Invalid — restore display to current saved value.
      setPriceStr(formatPriceCents(current?.retail_price_cents));
      return;
    }
    await saveField('retail_price_cents', next, 'Price', formatMoney(next));
  }

  async function handleCostBlur() {
    const next = parsePriceCents(costStr);
    if (next === null) {
      setCostStr(formatPriceCents(current?.cost_price_cents));
      return;
    }
    await saveField('cost_price_cents', next, 'Cost', formatMoney(next));
  }

  async function handleThresholdBlur() {
    const raw = thresholdStr.trim();
    const next = raw === '' ? null : parseInteger(raw);
    if (raw !== '' && next === null) {
      setThresholdStr(formatInt(current?.reorder_threshold));
      return;
    }
    await saveField(
      'reorder_threshold',
      next,
      'Reorder threshold',
      next === null ? 'cleared' : String(next),
    );
  }

  const qtyParsed = parseInteger(qtyStr);
  const qtyChanged = current !== null && qtyParsed !== null && qtyParsed !== current.quantity_on_hand;
  const qtyDelta = qtyChanged && current && qtyParsed !== null ? qtyParsed - current.quantity_on_hand : 0;
  const qtyCanSave = qtyChanged && qtyReason !== '' && !savingQty;

  async function handleQtySave() {
    if (!current || !qtyChanged || qtyReason === '') return;
    setSavingQty(true);
    try {
      const categoryLabel = QTY_REASON_OPTIONS.find((o) => o.value === qtyReason)?.label ?? qtyReason;
      const reason = qtyNotes.trim()
        ? `${categoryLabel} — ${qtyNotes.trim()}`
        : categoryLabel;

      const res = await adminFetch('/api/admin/stock-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: current.id,
          adjustment: qtyDelta,
          reason,
          adjustment_type: qtyReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Save failed');
      }

      const newQty = json.data?.quantity_after ?? current.quantity_on_hand + qtyDelta;
      const updated = { ...current, quantity_on_hand: newQty } as Product;
      setCurrent(updated);
      setQtyStr(formatInt(newQty));
      setQtyReason('');
      setQtyNotes('');
      onSaved?.(updated);
      toast.success(`Quantity updated — ${newQty}. Adjustment recorded.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save quantity');
    } finally {
      setSavingQty(false);
    }
  }

  return (
    <SlideOver
      open={open}
      onClose={() => onOpenChange(false)}
      title="Quick Edit"
      width="lg"
    >
      {current ? (
        <div className="space-y-6">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-ui-text truncate">{current.name}</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ui-text-dim">
              {current.sku && <span>SKU: <span className="font-mono text-ui-text-muted">{current.sku}</span></span>}
            </div>
          </div>

          <FormField label="Barcode" htmlFor="quick-edit-barcode">
            <div className="relative">
              <Input
                id="quick-edit-barcode"
                type="text"
                value={barcodeStr}
                onChange={(e) => setBarcodeStr(e.target.value)}
                onBlur={handleBarcodeBlur}
                placeholder="Scan or type…"
                autoComplete="off"
                data-scan-consumer=""
                className="pr-8"
              />
              {barcodeStr && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setBarcodeStr('')}
                  className={CLEAR_BUTTON_CLASS}
                  aria-label="Clear Barcode"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </FormField>

          <FormField label="Price" htmlFor="quick-edit-price">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ui-text-dim">$</span>
              <Input
                id="quick-edit-price"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                className="pl-7 pr-8"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                onBlur={handlePriceBlur}
                placeholder="0.00"
              />
              {priceStr && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPriceStr('')}
                  className={CLEAR_BUTTON_CLASS}
                  aria-label="Clear Price"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </FormField>

          {canViewCost && (
            <FormField label="Cost" htmlFor="quick-edit-cost">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ui-text-dim">$</span>
                <Input
                  id="quick-edit-cost"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  className="pl-7 pr-8"
                  value={costStr}
                  onChange={(e) => setCostStr(e.target.value)}
                  onBlur={handleCostBlur}
                  placeholder="0.00"
                />
                {costStr && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setCostStr('')}
                    className={CLEAR_BUTTON_CLASS}
                    aria-label="Clear Cost"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </FormField>
          )}

          <FormField label="Reorder Threshold" htmlFor="quick-edit-threshold" description="Alert when stock drops to this level. Leave blank for no alert.">
            <div className="relative">
              <Input
                id="quick-edit-threshold"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={thresholdStr}
                onChange={(e) => setThresholdStr(e.target.value)}
                onBlur={handleThresholdBlur}
                placeholder="e.g. 5"
                className="pr-8"
              />
              {thresholdStr && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setThresholdStr('')}
                  className={CLEAR_BUTTON_CLASS}
                  aria-label="Clear Reorder Threshold"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </FormField>

          <FormField label="Quantity on Hand" htmlFor="quick-edit-qty">
            <div className="relative">
              <Input
                id="quick-edit-qty"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={qtyStr}
                onChange={(e) => setQtyStr(e.target.value)}
                className="pr-8"
              />
              {qtyStr && (
                // Semantic differs from other fields: qty has no onBlur save
                // (qty changes require a reason via the amber adjustment
                // form). X here CANCELS an in-progress edit — setting the
                // field to empty hides the amber adjustment box and keeps
                // the saved DB qty untouched.
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setQtyStr('')}
                  className={CLEAR_BUTTON_CLASS}
                  aria-label="Cancel quantity edit"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </FormField>

          {qtyChanged && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700/40 dark:bg-amber-900/20">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Adjustment: {qtyDelta > 0 ? '+' : ''}{qtyDelta}
              </p>
              <FormField label="Reason category" htmlFor="quick-edit-qty-reason" required>
                <Select
                  id="quick-edit-qty-reason"
                  value={qtyReason}
                  onChange={(e) => setQtyReason(e.target.value as QtyReason | '')}
                >
                  <option value="">Select a reason…</option>
                  {QTY_REASON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Notes (optional)" htmlFor="quick-edit-qty-notes">
                <Textarea
                  id="quick-edit-qty-notes"
                  rows={2}
                  value={qtyNotes}
                  onChange={(e) => setQtyNotes(e.target.value)}
                  placeholder="e.g. Found 3 extra on shelf"
                />
              </FormField>
              <Button onClick={handleQtySave} disabled={!qtyCanSave} className="w-full">
                {savingQty ? 'Saving…' : 'Save Quantity Change'}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ui-text-dim">Loading…</p>
      )}
    </SlideOver>
  );
}
