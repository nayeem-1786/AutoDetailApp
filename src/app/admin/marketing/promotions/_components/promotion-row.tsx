'use client';

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';
import { formatPstShortDate } from '@/lib/utils/pst-date';
import { timestampToPstDate } from '@/lib/utils/pst-date';
import { dateToPstStartOfDay, dateToPstEndOfDay } from '@/lib/utils/pst-date';
import { Pencil, X, Check, Wrench, ShoppingBag } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

export interface ServicePricingRow {
  id: string;
  tier_name: string;
  tier_label: string | null;
  price: number;
  sale_price: number | null;
  display_order: number;
}

export interface PromotionItem {
  id: string;
  name: string;
  slug: string;
  item_type: 'service' | 'product';
  sale_status: 'active' | 'scheduled' | 'expired' | 'no_sale';
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  // Service fields
  pricing_model?: string;
  flat_price?: number | null;
  per_unit_price?: number | null;
  per_unit_label?: string | null;
  service_pricing?: ServicePricingRow[];
  // Product fields
  retail_price?: number;
  sale_price?: number | null;
}

// ─── Helpers ────────────────────────────────────────────────

function renderSalePeriod(item: PromotionItem) {
  const { sale_starts_at, sale_ends_at } = item;
  if (sale_starts_at && sale_ends_at) {
    return `${formatPstShortDate(sale_starts_at)} – ${formatPstShortDate(sale_ends_at)}`;
  }
  if (sale_starts_at) return `From ${formatPstShortDate(sale_starts_at)}`;
  if (sale_ends_at) return `Until ${formatPstShortDate(sale_ends_at)}`;
  return 'No limit';
}

function renderPriceLine(
  label: string | null,
  basePrice: number,
  salePrice: number | null,
  hasSale: boolean,
  suffix?: string
) {
  const formattedBase = formatCurrency(basePrice) + (suffix || '');
  if (!hasSale || salePrice === null) {
    return (
      <div key={label} className="text-gray-500 text-xs">
        {label && <span className="text-gray-400">{label}: </span>}
        {formattedBase}
      </div>
    );
  }
  return (
    <div key={label} className="text-xs">
      {label && <span className="text-gray-400">{label}: </span>}
      <span className="text-gray-400 line-through">{formattedBase}</span>
      <span className="ml-1 font-medium text-green-600">
        {formatCurrency(salePrice)}{suffix || ''}
      </span>
    </div>
  );
}

// ─── Adaptive Sale Price Display ────────────────────────────

function AdaptivePriceDisplay({ item }: { item: PromotionItem }) {
  const hasSale = item.sale_status !== 'no_sale';
  const tiers = item.service_pricing
    ? [...item.service_pricing].sort((a, b) => a.display_order - b.display_order)
    : [];

  if (item.item_type === 'product') {
    return renderPriceLine(null, item.retail_price ?? 0, item.sale_price ?? null, hasSale);
  }

  if (item.pricing_model === 'flat') {
    return renderPriceLine(null, item.flat_price ?? 0, item.sale_price ?? null, hasSale);
  }

  if (item.pricing_model === 'per_unit') {
    const suffix = `/${item.per_unit_label || 'unit'}`;
    return renderPriceLine(null, item.per_unit_price ?? 0, item.sale_price ?? null, hasSale, suffix);
  }

  // Tiered: vehicle_size, scope, specialty
  if (tiers.length > 0) {
    return (
      <div className="space-y-0.5">
        {tiers.map((tier) =>
          renderPriceLine(
            tier.tier_label || tier.tier_name,
            tier.price,
            tier.sale_price,
            hasSale
          )
        )}
      </div>
    );
  }

  return <span className="text-gray-400 text-xs">—</span>;
}

// ─── Discount Calc Logic (duplicated inline per prompt) ─────

type DiscountType = 'direct' | 'percentage' | 'fixed';

function calcSalePrice(
  basePrice: number,
  inputValue: number | '',
  discountType: DiscountType
): number | null {
  if (inputValue === '' || inputValue < 0) return null;
  if (discountType === 'direct') return inputValue;
  if (discountType === 'percentage') {
    if (inputValue <= 0 || inputValue >= 100) return null;
    return Math.round(basePrice * (1 - inputValue / 100) * 100) / 100;
  }
  // fixed amount off
  if (inputValue <= 0 || inputValue >= basePrice) return null;
  return Math.round((basePrice - inputValue) * 100) / 100;
}

function calcInputFromSalePrice(
  basePrice: number,
  salePrice: number,
  discountType: DiscountType
): number {
  if (discountType === 'direct') return salePrice;
  if (discountType === 'percentage') {
    return Math.round(((basePrice - salePrice) / basePrice) * 100 * 100) / 100;
  }
  // fixed
  return Math.round((basePrice - salePrice) * 100) / 100;
}

// ─── Inline Edit Form ───────────────────────────────────────

interface EditState {
  discountType: DiscountType;
  // For flat/per_unit/product: single value
  inputValue: number | '';
  // For tiered: keyed by tier_name
  tierInputs: Record<string, number | ''>;
  saleStartsAt: string;
  saleEndsAt: string;
}

function initEditState(item: PromotionItem): EditState {
  const discountType: DiscountType = 'direct';
  const tiers = item.service_pricing
    ? [...item.service_pricing].sort((a, b) => a.display_order - b.display_order)
    : [];

  if (item.item_type === 'product') {
    return {
      discountType,
      inputValue: item.sale_price ?? ('' as number | ''),
      tierInputs: {},
      saleStartsAt: item.sale_starts_at ? timestampToPstDate(item.sale_starts_at) : '',
      saleEndsAt: item.sale_ends_at ? timestampToPstDate(item.sale_ends_at) : '',
    };
  }

  if (item.pricing_model === 'flat' || item.pricing_model === 'per_unit') {
    return {
      discountType,
      inputValue: item.sale_price ?? ('' as number | ''),
      tierInputs: {},
      saleStartsAt: item.sale_starts_at ? timestampToPstDate(item.sale_starts_at) : '',
      saleEndsAt: item.sale_ends_at ? timestampToPstDate(item.sale_ends_at) : '',
    };
  }

  // Tiered
  const tierInputs: Record<string, number | ''> = {};
  for (const tier of tiers) {
    tierInputs[tier.tier_name] = tier.sale_price ?? '';
  }

  return {
    discountType,
    inputValue: '',
    tierInputs,
    saleStartsAt: item.sale_starts_at ? timestampToPstDate(item.sale_starts_at) : '',
    saleEndsAt: item.sale_ends_at ? timestampToPstDate(item.sale_ends_at) : '',
  };
}

function getValidationErrors(item: PromotionItem, state: EditState): string[] {
  const errors: string[] = [];
  const tiers = item.service_pricing
    ? [...item.service_pricing].sort((a, b) => a.display_order - b.display_order)
    : [];

  if (item.item_type === 'product') {
    const sp = calcSalePrice(item.retail_price ?? 0, state.inputValue, state.discountType);
    if (sp !== null && sp >= (item.retail_price ?? 0)) {
      errors.push('Sale price must be less than retail price');
    }
    if (state.inputValue !== '' && sp === null) {
      errors.push('Invalid discount value');
    }
    return errors;
  }

  if (item.pricing_model === 'flat') {
    const base = item.flat_price ?? 0;
    const sp = calcSalePrice(base, state.inputValue, state.discountType);
    if (sp !== null && sp >= base) {
      errors.push('Sale price must be less than base price');
    }
    if (state.inputValue !== '' && sp === null) {
      errors.push('Invalid discount value');
    }
    return errors;
  }

  if (item.pricing_model === 'per_unit') {
    const base = item.per_unit_price ?? 0;
    const sp = calcSalePrice(base, state.inputValue, state.discountType);
    if (sp !== null && sp >= base) {
      errors.push('Sale price must be less than base price');
    }
    if (state.inputValue !== '' && sp === null) {
      errors.push('Invalid discount value');
    }
    return errors;
  }

  // Tiered
  for (const tier of tiers) {
    const input = state.tierInputs[tier.tier_name];
    if (input === '' || input === undefined) continue;
    const sp = calcSalePrice(tier.price, input, state.discountType);
    if (sp !== null && sp >= tier.price) {
      errors.push(`${tier.tier_label || tier.tier_name}: sale price must be < ${formatCurrency(tier.price)}`);
    }
    if (sp === null) {
      errors.push(`${tier.tier_label || tier.tier_name}: invalid discount value`);
    }
  }

  return errors;
}

function isDirty(item: PromotionItem, state: EditState): boolean {
  const orig = initEditState(item);
  if (state.saleStartsAt !== orig.saleStartsAt) return true;
  if (state.saleEndsAt !== orig.saleEndsAt) return true;
  if (state.discountType !== 'direct') return true; // changed discount mode = dirty
  if (state.inputValue !== orig.inputValue) return true;
  for (const key of Object.keys(state.tierInputs)) {
    if (state.tierInputs[key] !== orig.tierInputs[key]) return true;
  }
  return false;
}

// ─── Edit Mode Inputs ───────────────────────────────────────

function EditPriceInputs({
  item,
  state,
  onChange,
}: {
  item: PromotionItem;
  state: EditState;
  onChange: (updates: Partial<EditState>) => void;
}) {
  const tiers = item.service_pricing
    ? [...item.service_pricing].sort((a, b) => a.display_order - b.display_order)
    : [];

  const discountLabel =
    state.discountType === 'direct'
      ? 'Sale Price'
      : state.discountType === 'percentage'
        ? '% Off'
        : '$ Off';

  // Single-price items (flat, per_unit, product)
  if (
    item.item_type === 'product' ||
    item.pricing_model === 'flat' ||
    item.pricing_model === 'per_unit'
  ) {
    const basePrice =
      item.item_type === 'product'
        ? item.retail_price ?? 0
        : item.pricing_model === 'flat'
          ? item.flat_price ?? 0
          : item.per_unit_price ?? 0;
    const suffix =
      item.pricing_model === 'per_unit' ? `/${item.per_unit_label || 'unit'}` : '';
    const computed = calcSalePrice(basePrice, state.inputValue, state.discountType);

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-gray-400">
              {discountLabel} (base: {formatCurrency(basePrice)}{suffix})
            </label>
            <Input
              type="number"
              min="0"
              step="1"
              value={state.inputValue}
              onChange={(e) =>
                onChange({ inputValue: e.target.value === '' ? '' : parseFloat(e.target.value) })
              }
              className="h-8 text-xs"
            />
          </div>
        </div>
        {state.discountType !== 'direct' && computed !== null && (
          <p className="text-[10px] text-gray-500">
            Preview: {formatCurrency(computed)}{suffix}
          </p>
        )}
      </div>
    );
  }

  // Tiered items
  return (
    <div className="space-y-1.5">
      {tiers.map((tier) => {
        const input = state.tierInputs[tier.tier_name] ?? '';
        const computed = calcSalePrice(tier.price, input, state.discountType);
        return (
          <div key={tier.tier_name}>
            <label className="text-[10px] text-gray-400">
              {tier.tier_label || tier.tier_name} {discountLabel} (base: {formatCurrency(tier.price)})
            </label>
            <Input
              type="number"
              min="0"
              step="1"
              value={input}
              onChange={(e) =>
                onChange({
                  tierInputs: {
                    ...state.tierInputs,
                    [tier.tier_name]: e.target.value === '' ? '' : parseFloat(e.target.value),
                  },
                })
              }
              className="h-8 text-xs"
            />
            {state.discountType !== 'direct' && computed !== null && (
              <p className="text-[10px] text-gray-500">
                Preview: {formatCurrency(computed)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main PromotionRow ──────────────────────────────────────

export function PromotionRow({
  item,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onEndSale,
  onSaved,
}: {
  item: PromotionItem;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEndSale: () => void;
  onSaved: () => void;
}) {
  const Icon = item.item_type === 'service' ? Wrench : ShoppingBag;
  const [editState, setEditState] = useState<EditState>(() => initEditState(item));
  const [saving, setSaving] = useState(false);

  // Re-init edit state when entering edit mode
  const handleStartEdit = () => {
    setEditState(initEditState(item));
    onStartEdit();
  };

  const updateState = (updates: Partial<EditState>) => {
    setEditState((prev) => ({ ...prev, ...updates }));
  };

  // When switching discount type, recalculate inputs from existing sale prices
  const handleDiscountTypeChange = (newType: DiscountType) => {
    const tiers = item.service_pricing
      ? [...item.service_pricing].sort((a, b) => a.display_order - b.display_order)
      : [];

    if (
      item.item_type === 'product' ||
      item.pricing_model === 'flat' ||
      item.pricing_model === 'per_unit'
    ) {
      const basePrice =
        item.item_type === 'product'
          ? item.retail_price ?? 0
          : item.pricing_model === 'flat'
            ? item.flat_price ?? 0
            : item.per_unit_price ?? 0;

      // If current sale price exists, convert it to the new discount type
      const currentSalePrice =
        editState.discountType === 'direct'
          ? editState.inputValue
          : calcSalePrice(basePrice, editState.inputValue, editState.discountType);

      const newInput =
        currentSalePrice !== null && currentSalePrice !== '' && typeof currentSalePrice === 'number'
          ? calcInputFromSalePrice(basePrice, currentSalePrice, newType)
          : '';

      setEditState((prev) => ({ ...prev, discountType: newType, inputValue: newInput }));
    } else {
      // Tiered
      const newTierInputs: Record<string, number | ''> = {};
      for (const tier of tiers) {
        const currentInput = editState.tierInputs[tier.tier_name];
        const currentSalePrice =
          editState.discountType === 'direct'
            ? currentInput
            : calcSalePrice(tier.price, currentInput ?? '', editState.discountType);

        newTierInputs[tier.tier_name] =
          currentSalePrice !== null && currentSalePrice !== '' && typeof currentSalePrice === 'number'
            ? calcInputFromSalePrice(tier.price, currentSalePrice, newType)
            : '';
      }
      setEditState((prev) => ({ ...prev, discountType: newType, tierInputs: newTierInputs }));
    }
  };

  const errors = useMemo(() => getValidationErrors(item, editState), [item, editState]);
  const dirty = useMemo(() => isDirty(item, editState), [item, editState]);

  const handleSave = async () => {
    if (errors.length > 0) return;
    setSaving(true);

    const tiers = item.service_pricing
      ? [...item.service_pricing].sort((a, b) => a.display_order - b.display_order)
      : [];

    const startTs = dateToPstStartOfDay(editState.saleStartsAt || null);
    const endTs = dateToPstEndOfDay(editState.saleEndsAt || null);

    let batchItem: Record<string, unknown>;

    if (item.item_type === 'product') {
      const sp = calcSalePrice(item.retail_price ?? 0, editState.inputValue, editState.discountType);
      batchItem = { type: 'product', id: item.id, sale_price: sp };
    } else if (item.pricing_model === 'flat' || item.pricing_model === 'per_unit') {
      const base =
        item.pricing_model === 'flat' ? item.flat_price ?? 0 : item.per_unit_price ?? 0;
      const sp = calcSalePrice(base, editState.inputValue, editState.discountType);
      batchItem = { type: 'service', id: item.id, sale_price: sp };
    } else {
      // Tiered: sale_prices keyed by tier_name
      const salePrices: Record<string, number> = {};
      for (const tier of tiers) {
        const input = editState.tierInputs[tier.tier_name];
        if (input !== '' && input !== undefined) {
          const sp = calcSalePrice(tier.price, input, editState.discountType);
          if (sp !== null) salePrices[tier.tier_name] = sp;
        }
      }
      batchItem = { type: 'service', id: item.id, sale_prices: salePrices };
    }

    try {
      const res = await fetch('/api/admin/marketing/promotions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [batchItem],
          sale_starts_at: startTs,
          sale_ends_at: endTs,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Sale updated for ${item.name}`);
      onSaved();
    } catch {
      toast.error('Failed to save sale price');
    } finally {
      setSaving(false);
    }
  };

  // ─── Display Mode ───────────────────────────────────────────

  if (!isEditing) {
    return (
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="px-3 py-2">
          <Icon className="h-4 w-4 text-gray-400" />
        </td>
        <td className="px-3 py-2 font-medium text-gray-900">{item.name}</td>
        <td className="px-3 py-2">
          <AdaptivePriceDisplay item={item} />
        </td>
        <td className="px-3 py-2 text-xs text-gray-500">
          {renderSalePeriod(item)}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={handleStartEdit} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {item.sale_status !== 'no_sale' && (
              <Button variant="ghost" size="sm" onClick={onEndSale} title="End Sale">
                <X className="h-3.5 w-3.5 text-red-500" />
              </Button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  // ─── Edit Mode ──────────────────────────────────────────────

  return (
    <tr className="border-b border-gray-100 bg-blue-50/40">
      <td className="px-3 py-2 align-top">
        <Icon className="h-4 w-4 text-gray-400 mt-1" />
      </td>
      <td className="px-3 py-2 align-top font-medium text-gray-900">{item.name}</td>
      <td className="px-3 py-3 align-top">
        <div className="space-y-2 max-w-[240px]">
          {/* Discount type toggle */}
          <div className="flex gap-1">
            {([
              ['direct', 'Direct Price'],
              ['percentage', '% Off'],
              ['fixed', '$ Off'],
            ] as [DiscountType, string][]).map(([type, label]) => (
              <button
                key={type}
                onClick={() => handleDiscountTypeChange(type)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  editState.discountType === type
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Price inputs */}
          <EditPriceInputs item={item} state={editState} onChange={updateState} />

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="space-y-0.5">
              {errors.map((err, i) => (
                <p key={i} className="text-[10px] text-red-500">{err}</p>
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <div className="space-y-1.5 max-w-[180px]">
          <div>
            <label className="text-[10px] text-gray-400">Start</label>
            <Input
              type="date"
              value={editState.saleStartsAt}
              onChange={(e) => updateState({ saleStartsAt: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400">End</label>
            <Input
              type="date"
              value={editState.saleEndsAt}
              onChange={(e) => updateState({ saleEndsAt: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <p className="text-[10px] text-gray-400">Leave empty for no time limit</p>
        </div>
      </td>
      <td className="px-3 py-2 text-right align-top">
        <div className="flex items-center justify-end gap-1 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={saving || errors.length > 0}
            title="Save"
          >
            <Check className="h-3.5 w-3.5 text-green-600" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelEdit}
            disabled={saving}
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

export { isDirty, initEditState };
