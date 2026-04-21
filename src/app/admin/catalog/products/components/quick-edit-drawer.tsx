'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { SlideOver } from '@/components/ui/slide-over';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { usePermission } from '@/lib/hooks/use-permission';
import { formatCurrency } from '@/lib/utils/format';
import type { Product } from '@/lib/supabase/types';

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

function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return Number.isFinite(n) ? n.toFixed(2) : '';
}
function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return String(n);
}

function parsePrice(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
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
    setPriceStr(formatPrice(product?.retail_price));
    setCostStr(formatPrice(product?.cost_price));
    setThresholdStr(formatInt(product?.reorder_threshold));
    setQtyStr(formatInt(product?.quantity_on_hand));
    setQtyReason('');
    setQtyNotes('');
  }, [product?.id, product?.retail_price, product?.cost_price, product?.reorder_threshold, product?.quantity_on_hand]);

  // Shared autosave helper for price/cost/threshold.
  const saveField = useCallback(
    async (
      field: 'retail_price' | 'cost_price' | 'reorder_threshold',
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
        if (field === 'retail_price') setPriceStr(formatPrice(oldValue));
        else if (field === 'cost_price') setCostStr(formatPrice(oldValue));
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
            if (field === 'retail_price') setPriceStr(formatPrice(oldValue));
            else if (field === 'cost_price') setCostStr(formatPrice(oldValue));
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
            const reverted = field === 'reorder_threshold' ? formatInt(oldValue) : `$${formatPrice(oldValue)}`;
            toast(`Reverted to ${reverted}`);
          },
        },
      });
    },
    [current, supabase, onSaved],
  );

  async function handlePriceBlur() {
    const next = parsePrice(priceStr);
    if (next === null) {
      // Invalid — restore display to current saved value.
      setPriceStr(formatPrice(current?.retail_price));
      return;
    }
    await saveField('retail_price', next, 'Price', formatCurrency(next));
  }

  async function handleCostBlur() {
    const next = parsePrice(costStr);
    if (next === null) {
      setCostStr(formatPrice(current?.cost_price));
      return;
    }
    await saveField('cost_price', next, 'Cost', formatCurrency(next));
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
              {current.barcode && <span>Barcode: <span className="font-mono text-ui-text-muted">{current.barcode}</span></span>}
            </div>
          </div>

          <FormField label="Price" htmlFor="quick-edit-price">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ui-text-dim">$</span>
              <Input
                id="quick-edit-price"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                className="pl-7"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                onBlur={handlePriceBlur}
                placeholder="0.00"
              />
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
                  className="pl-7"
                  value={costStr}
                  onChange={(e) => setCostStr(e.target.value)}
                  onBlur={handleCostBlur}
                  placeholder="0.00"
                />
              </div>
            </FormField>
          )}

          <FormField label="Reorder Threshold" htmlFor="quick-edit-threshold" description="Alert when stock drops to this level. Leave blank for no alert.">
            <Input
              id="quick-edit-threshold"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={thresholdStr}
              onChange={(e) => setThresholdStr(e.target.value)}
              onBlur={handleThresholdBlur}
              placeholder="e.g. 5"
            />
          </FormField>

          <FormField label="Quantity on Hand" htmlFor="quick-edit-qty">
            <Input
              id="quick-edit-qty"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value)}
            />
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
