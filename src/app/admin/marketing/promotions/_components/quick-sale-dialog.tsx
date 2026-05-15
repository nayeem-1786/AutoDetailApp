'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils/format';
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit';
import { dateToPstStartOfDay, dateToPstEndOfDay } from '@/lib/utils/pst-date';
import { X, Wrench, ShoppingBag, AlertTriangle, Info } from 'lucide-react';
import type { PromotionItem, ServicePricingRow } from './promotion-row';

// ─── Types ──────────────────────────────────────────────────

export interface QuickSaleItem {
  type: 'service' | 'product';
  id: string;
  name: string;
  pricing_model?: string;
  flat_price?: number | null;
  per_unit_price?: number | null;
  per_unit_label?: string | null;
  tiers?: ServicePricingRow[];
  retail_price?: number;
  // Conflict detection fields
  sale_status: 'active' | 'scheduled' | 'expired' | 'no_sale';
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  current_sale_price?: number | null;
  current_tier_sale_prices?: { tier_label: string | null; tier_name: string; sale_price: number | null }[];
  // Pre-fill: direct sale prices to restore (set by duplicate action)
  prefilled_sale_price?: number | null;
  prefilled_tier_sale_prices?: Record<string, number>;
}

export interface QuickSalePrefill {
  item: QuickSaleItem;
  source: string; // e.g. "Headlight Restoration (ended Mar 17)"
}

// ─── Component ──────────────────────────────────────────────

export function QuickSaleDialog({
  open,
  onOpenChange,
  onApplied,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
  prefill?: QuickSalePrefill | null;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PromotionItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<QuickSaleItem[]>([]);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed' | 'direct'>('percentage');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [applySedan, setApplySedan] = useState(true);
  const [applyTruck, setApplyTruck] = useState(true);
  const [applySuv, setApplySuv] = useState(true);
  const [saleStartsAt, setSaleStartsAt] = useState('');
  const [saleEndsAt, setSaleEndsAt] = useState('');
  const [applying, setApplying] = useState(false);
  const [searching, setSearching] = useState(false);
  const [prefillSource, setPrefillSource] = useState<string | null>(null);

  // Reset on open, then apply prefill if provided
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setSearchResults([]);
      setDiscountType('percentage');
      setDiscountValue('');
      setApplySedan(true);
      setApplyTruck(true);
      setApplySuv(true);
      setSaleStartsAt('');
      setSaleEndsAt('');
      setPrefillSource(null);

      if (prefill) {
        setSelectedItems([prefill.item]);
        setDiscountType('direct');
        setDiscountValue(''); // Not used in direct mode
        setPrefillSource(prefill.source);
      } else {
        setSelectedItems([]);
      }
    }
  }, [open, prefill]);

  // Search items
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/marketing/promotions?search=${encodeURIComponent(searchQuery)}`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          setSearchResults(json.data || []);
        }
      } catch { /* silent */ }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function addItem(item: PromotionItem) {
    if (selectedItems.some((s) => s.id === item.id && s.type === item.item_type)) return;
    const tiers = item.service_pricing
      ? [...item.service_pricing].sort((a, b) => a.display_order - b.display_order)
      : undefined;
    setSelectedItems((prev) => [
      ...prev,
      {
        type: item.item_type,
        id: item.id,
        name: item.name,
        pricing_model: item.pricing_model,
        flat_price: item.flat_price,
        per_unit_price: item.per_unit_price,
        per_unit_label: item.per_unit_label,
        tiers,
        retail_price: item.retail_price,
        sale_status: item.sale_status,
        sale_starts_at: item.sale_starts_at,
        sale_ends_at: item.sale_ends_at,
        current_sale_price: item.sale_price,
        current_tier_sale_prices: tiers?.map((t) => ({
          tier_label: t.tier_label,
          tier_name: t.tier_name,
          sale_price: t.sale_price,
        })),
      },
    ]);
    setSearchQuery('');
    setSearchResults([]);
  }

  function removeItem(id: string) {
    setSelectedItems((prev) => prev.filter((i) => i.id !== id));
  }

  function calculateSalePrice(standard: number): number {
    if (discountType === 'direct') return standard; // Direct mode uses pre-filled prices
    if (typeof discountValue !== 'number' || discountValue <= 0) return standard;
    if (discountType === 'percentage') {
      return Math.round((standard * (1 - discountValue / 100)) * 100) / 100;
    }
    return Math.max(0, standard - discountValue);
  }

  async function handleApply() {
    if (selectedItems.length === 0) return;
    // In non-direct mode, require a discount value
    if (discountType !== 'direct' && (typeof discountValue !== 'number' || discountValue <= 0)) return;
    setApplying(true);

    const startTs = dateToPstStartOfDay(saleStartsAt);
    const endTs = dateToPstEndOfDay(saleEndsAt);

    const batchItems = selectedItems.map((item) => {
      if (item.type === 'service') {
        const isFlatPerUnit = item.pricing_model === 'flat' || item.pricing_model === 'per_unit';
        if (isFlatPerUnit) {
          const basePrice = item.pricing_model === 'flat' ? (item.flat_price ?? 0) : (item.per_unit_price ?? 0);
          const sp = discountType === 'direct' && item.prefilled_sale_price != null
            ? item.prefilled_sale_price
            : calculateSalePrice(basePrice);
          return { type: 'service' as const, id: item.id, sale_price: sp };
        }
        // Tiered
        const salePrices: Record<string, number> = {};
        if (discountType === 'direct' && item.prefilled_tier_sale_prices) {
          // Use pre-filled tier prices
          for (const [tierName, salePrice] of Object.entries(item.prefilled_tier_sale_prices)) {
            salePrices[tierName] = salePrice;
          }
        } else {
          for (const tier of (item.tiers || [])) {
            const shouldApply =
              (tier.tier_name === 'sedan' && applySedan) ||
              (tier.tier_name === 'truck_suv_2row' && applyTruck) ||
              (tier.tier_name === 'suv_3row_van' && applySuv);
            if (shouldApply) {
              salePrices[tier.tier_name] = calculateSalePrice(tier.price);
            }
          }
        }
        return { type: 'service' as const, id: item.id, sale_prices: salePrices };
      }
      // Product
      const sp = discountType === 'direct' && item.prefilled_sale_price != null
        ? item.prefilled_sale_price
        : calculateSalePrice(item.retail_price ?? 0);
      return { type: 'product' as const, id: item.id, sale_price: sp };
    });

    try {
      const res = await fetch('/api/admin/marketing/promotions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: batchItems,
          sale_starts_at: startTs,
          sale_ends_at: endTs,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      toast.success(`Sale applied to ${json.updated} items`);
      onOpenChange(false);
      onApplied();
    } catch {
      toast.error('Failed to apply sale');
    } finally {
      setApplying(false);
    }
  }

  function renderConflictWarning(item: QuickSaleItem) {
    const hasConflict = item.sale_status === 'active' || item.sale_status === 'scheduled';
    if (!hasConflict) return null;

    const statusLabel = item.sale_status === 'active' ? 'active sale' : 'scheduled sale';
    const currentPrices: string[] = [];
    if (item.type === 'product' && item.current_sale_price != null) {
      currentPrices.push(formatCurrency(item.current_sale_price));
    } else if (item.pricing_model === 'flat' || item.pricing_model === 'per_unit') {
      if (item.current_sale_price != null) {
        const suffix = item.pricing_model === 'per_unit' ? `/${item.per_unit_label || 'unit'}` : '';
        currentPrices.push(formatCurrency(item.current_sale_price) + suffix);
      }
    } else if (item.current_tier_sale_prices) {
      for (const t of item.current_tier_sale_prices) {
        if (t.sale_price != null) {
          currentPrices.push(`${t.tier_label || t.tier_name}: ${formatCurrency(t.sale_price)}`);
        }
      }
    }

    return (
      <div className="mt-1">
        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
          <AlertTriangle className="h-3 w-3" />
          Has {statusLabel}
        </span>
        {currentPrices.length > 0 && (
          <p className="mt-0.5 text-[10px] text-amber-600">
            Current: {currentPrices.join(', ')}
          </p>
        )}
      </div>
    );
  }

  // Determine if Apply should be enabled
  const canApply = selectedItems.length > 0 && (
    discountType === 'direct' || (typeof discountValue === 'number' && discountValue > 0)
  );

  const enterSubmitDiscount = useEnterSubmit(handleApply, !applying && canApply);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>Quick Sale</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Pre-fill source banner */}
        {prefillSource && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Duplicating from: <span className="font-medium">{prefillSource}</span>. Set new dates below.</span>
          </div>
        )}

        {/* Search to add items */}
        <FormField label="Select items">
          <SearchInput
            placeholder="Search to add items..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
          {searching && <p className="mt-1 text-xs text-gray-400">Searching...</p>}
          {searchResults.length > 0 && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-gray-200">
              {searchResults
                .filter((r) => !selectedItems.some((s) => s.id === r.id && s.type === r.item_type))
                .map((r) => (
                  <button
                    type="button"
                    key={`${r.item_type}-${r.id}`}
                    onClick={() => addItem(r)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50"
                  >
                    {r.item_type === 'service' ? (
                      <Wrench className="h-3.5 w-3.5 text-gray-400" />
                    ) : (
                      <ShoppingBag className="h-3.5 w-3.5 text-gray-400" />
                    )}
                    <span className="flex-1">
                      {r.name}
                      {(r.sale_status === 'active' || r.sale_status === 'scheduled') && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {r.sale_status === 'active' ? 'Active sale' : 'Scheduled'}
                        </span>
                      )}
                    </span>
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {r.item_type}
                    </Badge>
                  </button>
                ))}
            </div>
          )}
        </FormField>

        {/* Selected items */}
        {selectedItems.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">Selected ({selectedItems.length}):</p>
            <div className="space-y-1">
              {selectedItems.map((item) => (
                <div key={item.id} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => removeItem(item.id)} className="text-gray-400 hover:text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <span className="flex-1 font-medium">{item.name}</span>
                    <Badge variant="secondary" className="text-[10px]">{item.type}</Badge>
                    {item.type === 'product' && (
                      <span className="text-xs text-gray-500">{formatCurrency(item.retail_price ?? 0)}</span>
                    )}
                    {item.type === 'service' && item.pricing_model === 'flat' && item.flat_price != null && (
                      <span className="text-xs text-gray-500">{formatCurrency(item.flat_price)}</span>
                    )}
                    {item.type === 'service' && item.pricing_model === 'per_unit' && item.per_unit_price != null && (
                      <span className="text-xs text-gray-500">{formatCurrency(item.per_unit_price)}/{item.per_unit_label || 'unit'}</span>
                    )}
                  </div>
                  {renderConflictWarning(item)}
                  {/* Show pre-filled prices in direct mode */}
                  {discountType === 'direct' && item.prefilled_sale_price != null && (
                    <p className="mt-1 text-[10px] text-green-600">
                      Sale price: {formatCurrency(item.prefilled_sale_price)}
                      {item.pricing_model === 'per_unit' && `/${item.per_unit_label || 'unit'}`}
                    </p>
                  )}
                  {discountType === 'direct' && item.prefilled_tier_sale_prices && Object.keys(item.prefilled_tier_sale_prices).length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {Object.entries(item.prefilled_tier_sale_prices).map(([tierName, price]) => {
                        const tier = item.tiers?.find((t) => t.tier_name === tierName);
                        return (
                          <p key={tierName} className="text-[10px] text-green-600">
                            {tier?.tier_label || tierName}: {formatCurrency(price)}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discount — hidden in direct mode (prices are pre-filled) */}
        {discountType !== 'direct' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Discount type">
                <div className="flex gap-2">
                  {(['percentage', 'fixed'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDiscountType(t)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        discountType === t
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t === 'percentage' ? 'Percentage off' : 'Fixed amount off'}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Discount">
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    {...enterSubmitDiscount}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    {discountType === 'percentage' ? '%' : '$'}
                  </span>
                </div>
              </FormField>
            </div>

            {/* Tier checkboxes */}
            {selectedItems.some((i) => i.type === 'service' && i.pricing_model !== 'flat' && i.pricing_model !== 'per_unit' && i.pricing_model !== 'custom') && (
              <FormField label="Apply to tiers (services only)">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={applySedan} onChange={() => setApplySedan(!applySedan)} />
                    Sedan
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={applyTruck} onChange={() => setApplyTruck(!applyTruck)} />
                    Truck/SUV
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={applySuv} onChange={() => setApplySuv(!applySuv)} />
                    SUV/Van
                  </label>
                </div>
              </FormField>
            )}
          </>
        )}

        {/* Switch to manual mode when in direct mode */}
        {discountType === 'direct' && (
          <button
            type="button"
            onClick={() => { setDiscountType('percentage'); setDiscountValue(''); }}
            className="text-xs text-blue-600 hover:text-blue-700 underline"
          >
            Switch to percentage/fixed discount
          </button>
        )}

        {/* Sale period */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Start Date">
            <Input type="date" value={saleStartsAt} onChange={(e) => setSaleStartsAt(e.target.value)} />
          </FormField>
          <FormField label="End Date">
            <Input type="date" value={saleEndsAt} onChange={(e) => setSaleEndsAt(e.target.value)} />
          </FormField>
        </div>

        {/* Preview — only in non-direct mode */}
        {discountType !== 'direct' && selectedItems.length > 0 && typeof discountValue === 'number' && discountValue > 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500">Preview</p>
            {selectedItems.map((item) => (
              <div key={item.id} className="text-sm">
                <p className="font-medium text-gray-700">{item.name}:</p>
                {item.type === 'service' && (item.pricing_model === 'flat' || item.pricing_model === 'per_unit') ? (() => {
                  const basePrice = item.pricing_model === 'flat' ? (item.flat_price ?? 0) : (item.per_unit_price ?? 0);
                  const sp = calculateSalePrice(basePrice);
                  const valid = sp > 0 && sp < basePrice;
                  return (
                    <p className={`ml-4 ${valid ? 'text-gray-600' : 'text-red-500'}`}>
                      {formatCurrency(basePrice)} &rarr; {formatCurrency(sp)}
                      {item.pricing_model === 'per_unit' && ` /${item.per_unit_label || 'unit'}`}
                      {!valid && ' (invalid)'}
                    </p>
                  );
                })() : item.type === 'service' && item.tiers && item.tiers.length > 0 ? (
                  <div className="ml-4 space-y-0.5">
                    {item.tiers
                      .sort((a, b) => a.display_order - b.display_order)
                      .map((tier) => {
                        const shouldApply =
                          (tier.tier_name === 'sedan' && applySedan) ||
                          (tier.tier_name === 'truck_suv_2row' && applyTruck) ||
                          (tier.tier_name === 'suv_3row_van' && applySuv);
                        if (!shouldApply) return null;
                        const sp = calculateSalePrice(tier.price);
                        const valid = sp > 0 && sp < tier.price;
                        return (
                          <p key={tier.tier_name} className={valid ? 'text-gray-600' : 'text-red-500'}>
                            {tier.tier_label || tier.tier_name}: {formatCurrency(tier.price)} &rarr; {formatCurrency(sp)}
                            {!valid && ' (invalid)'}
                          </p>
                        );
                      })}
                  </div>
                ) : (
                  <p className="ml-4 text-gray-600">
                    {formatCurrency(item.retail_price ?? 0)} &rarr; {formatCurrency(calculateSalePrice(item.retail_price ?? 0))}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
          Cancel
        </Button>
        <Button
          onClick={handleApply}
          disabled={applying || !canApply}
        >
          {applying ? 'Applying...' : `Apply Sale to ${selectedItems.length} Item${selectedItems.length !== 1 ? 's' : ''}`}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
