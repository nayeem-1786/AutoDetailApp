'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { formatCurrency } from '@/lib/utils/format';
import {
  isEndingSoon,
} from '@/lib/utils/sale-pricing';
import {
  Search,
  Plus,
  Pencil,
  X,
  ChevronDown,
  ChevronRight,
  Wrench,
  ShoppingBag,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

interface ServicePricingRow {
  id: string;
  tier_name: string;
  tier_label: string | null;
  price: number;
  sale_price: number | null;
  display_order: number;
}

interface PromotionItem {
  id: string;
  name: string;
  slug: string;
  item_type: 'service' | 'product';
  sale_status: 'active' | 'scheduled' | 'expired' | 'no_sale';
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  // Service fields
  pricing_model?: string;
  service_pricing?: ServicePricingRow[];
  // Product fields
  retail_price?: number;
  sale_price?: number | null;
}

interface Counts {
  active: number;
  scheduled: number;
  expired: number;
  no_sale: number;
}

// ─── Main Page ──────────────────────────────────────────────

export default function PromotionsPage() {
  const router = useRouter();
  const [items, setItems] = useState<PromotionItem[]>([]);
  const [counts, setCounts] = useState<Counts>({ active: 0, scheduled: 0, expired: 0, no_sale: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'service' | 'product'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'scheduled' | 'expired' | 'no_sale'>('all');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['active', 'scheduled', 'expired']));
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [clearConfirmItem, setClearConfirmItem] = useState<PromotionItem | null>(null);
  const [clearing, setClearing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/marketing/promotions?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setItems(json.data || []);
      setCounts(json.counts || { active: 0, scheduled: 0, expired: 0, no_sale: 0 });
    } catch {
      toast.error('Failed to load promotions');
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchData, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  // Group items by sale_status
  const grouped = useMemo(() => {
    const groups: Record<string, PromotionItem[]> = {
      active: [],
      scheduled: [],
      expired: [],
      no_sale: [],
    };
    items.forEach((item) => {
      groups[item.sale_status]?.push(item);
    });
    return groups;
  }, [items]);

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleClearSale(item: PromotionItem) {
    setClearing(true);
    try {
      const res = await fetch('/api/admin/marketing/promotions/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ type: item.item_type, id: item.id }] }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Sale ended for ${item.name}`);
      setClearConfirmItem(null);
      fetchData();
    } catch {
      toast.error('Failed to clear sale');
    } finally {
      setClearing(false);
    }
  }

  const STATUS_SECTIONS: { key: string; label: string; emoji: string }[] = [
    { key: 'active', label: 'Active Sales', emoji: '🟢' },
    { key: 'scheduled', label: 'Scheduled', emoji: '🟡' },
    { key: 'expired', label: 'Expired (recent)', emoji: '🔴' },
    { key: 'no_sale', label: 'No Sale', emoji: '⚪' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promotions"
        description="Manage sale pricing across services and products"
        action={
          <Button onClick={() => setQuickSaleOpen(true)}>
            <Plus className="h-4 w-4" />
            Quick Sale
          </Button>
        }
      />

      {/* Search & Filters */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search services and products by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-medium">Type:</span>
              {(['all', 'service', 'product'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    typeFilter === t
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t === 'all' ? 'All' : t === 'service' ? 'Services' : 'Products'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-medium">Status:</span>
              {(['all', 'active', 'scheduled', 'expired', 'no_sale'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s === 'all' ? 'All' : s === 'no_sale' ? 'No Sale' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{counts.active}</p>
              <p className="text-xs text-gray-500">Active Sales</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-2xl font-bold text-yellow-600">{counts.scheduled}</p>
              <p className="text-xs text-gray-500">Scheduled</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-2xl font-bold text-red-500">{counts.expired}</p>
              <p className="text-xs text-gray-500">Expired</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          No items found matching your filters.
        </div>
      ) : (
        <div className="space-y-4">
          {STATUS_SECTIONS.map(({ key, label, emoji }) => {
            const sectionItems = grouped[key] || [];
            if (sectionItems.length === 0) return null;
            // Hide "No Sale" section by default unless that filter is active
            if (key === 'no_sale' && statusFilter !== 'no_sale') return null;

            const isExpanded = expandedSections.has(key);

            return (
              <Card key={key}>
                <button
                  onClick={() => toggleSection(key)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span>{emoji}</span>
                    <span className="text-sm font-semibold text-gray-700">{label}</span>
                    <Badge variant="secondary">{sectionItems.length}</Badge>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Type</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Name</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Sedan</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Truck/SUV</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">SUV/Van</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Ends</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionItems.map((item) => (
                            <PromotionRow
                              key={`${item.item_type}-${item.id}`}
                              item={item}
                              onEdit={() => {
                                if (item.item_type === 'service') {
                                  router.push(`/admin/catalog/services/${item.id}`);
                                } else {
                                  router.push(`/admin/catalog/products/${item.id}`);
                                }
                              }}
                              onEndSale={() => setClearConfirmItem(item)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* End Sale Confirm */}
      <ConfirmDialog
        open={!!clearConfirmItem}
        onOpenChange={(open) => !open && setClearConfirmItem(null)}
        title="End Sale"
        description={`End the sale for "${clearConfirmItem?.name}"? This will clear all sale prices and dates.`}
        confirmLabel="End Sale"
        variant="destructive"
        loading={clearing}
        onConfirm={() => clearConfirmItem && handleClearSale(clearConfirmItem)}
      />

      {/* Quick Sale Dialog */}
      <QuickSaleDialog
        open={quickSaleOpen}
        onOpenChange={setQuickSaleOpen}
        onApplied={fetchData}
      />
    </div>
  );
}

// ─── Promotion Row ──────────────────────────────────────────

function PromotionRow({
  item,
  onEdit,
  onEndSale,
}: {
  item: PromotionItem;
  onEdit: () => void;
  onEndSale: () => void;
}) {
  const Icon = item.item_type === 'service' ? Wrench : ShoppingBag;
  const tiers = item.service_pricing
    ? [...item.service_pricing].sort((a, b) => a.display_order - b.display_order)
    : [];

  function renderPrice(standard: number, sale: number | null) {
    if (sale === null || item.sale_status === 'no_sale') {
      return <span className="text-gray-600">{formatCurrency(standard)}</span>;
    }
    return (
      <span>
        <span className="text-gray-400 line-through text-xs">{formatCurrency(standard)}</span>
        <span className="ml-1 font-medium text-green-600">{formatCurrency(sale)}</span>
      </span>
    );
  }

  function renderTierCell(tierName: string) {
    if (item.item_type === 'product') {
      // Products span across tier columns — only show in first
      if (tierName === 'sedan') {
        return renderPrice(item.retail_price!, item.sale_price ?? null);
      }
      return <span className="text-gray-300">—</span>;
    }
    const tier = tiers.find((t) => t.tier_name === tierName);
    if (!tier) return <span className="text-gray-300">—</span>;
    return renderPrice(tier.price, tier.sale_price);
  }

  const endDate = item.sale_ends_at ? new Date(item.sale_ends_at) : null;
  const endingSoon = isEndingSoon(endDate);

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2">
        <Icon className="h-4 w-4 text-gray-400" />
      </td>
      <td className="px-3 py-2 font-medium text-gray-900">{item.name}</td>
      <td className="px-3 py-2">{renderTierCell('sedan')}</td>
      <td className="px-3 py-2">{renderTierCell('truck_suv_2row')}</td>
      <td className="px-3 py-2">{renderTierCell('suv_3row_van')}</td>
      <td className="px-3 py-2 text-xs text-gray-500">
        {endDate && (
          <span className={endingSoon ? 'text-amber-600 font-medium' : ''}>
            {endingSoon && '⏰ '}
            {endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} title="Edit">
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

// ─── Quick Sale Dialog ──────────────────────────────────────

interface QuickSaleItem {
  type: 'service' | 'product';
  id: string;
  name: string;
  tiers?: ServicePricingRow[];
  retail_price?: number;
}

function QuickSaleDialog({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PromotionItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<QuickSaleItem[]>([]);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [applySedan, setApplySedan] = useState(true);
  const [applyTruck, setApplyTruck] = useState(true);
  const [applySuv, setApplySuv] = useState(true);
  const [saleStartsAt, setSaleStartsAt] = useState('');
  const [saleEndsAt, setSaleEndsAt] = useState('');
  const [applying, setApplying] = useState(false);
  const [searching, setSearching] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedItems([]);
      setDiscountValue('');
      setDiscountType('percentage');
      setApplySedan(true);
      setApplyTruck(true);
      setApplySuv(true);
      setSaleStartsAt('');
      setSaleEndsAt('');
    }
  }, [open]);

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
    setSelectedItems((prev) => [
      ...prev,
      {
        type: item.item_type,
        id: item.id,
        name: item.name,
        tiers: item.service_pricing as ServicePricingRow[] | undefined,
        retail_price: item.retail_price,
      },
    ]);
    setSearchQuery('');
    setSearchResults([]);
  }

  function removeItem(id: string) {
    setSelectedItems((prev) => prev.filter((i) => i.id !== id));
  }

  function calculateSalePrice(standard: number): number {
    if (typeof discountValue !== 'number' || discountValue <= 0) return standard;
    if (discountType === 'percentage') {
      return Math.round((standard * (1 - discountValue / 100)) * 100) / 100;
    }
    return Math.max(0, standard - discountValue);
  }

  async function handleApply() {
    if (selectedItems.length === 0 || typeof discountValue !== 'number' || discountValue <= 0) return;
    setApplying(true);

    const startTs = saleStartsAt ? new Date(saleStartsAt + 'T00:00:00-08:00').toISOString() : null;
    const endTs = saleEndsAt ? new Date(saleEndsAt + 'T23:59:59-08:00').toISOString() : null;

    const batchItems = selectedItems.map((item) => {
      if (item.type === 'service' && item.tiers) {
        const salePrices: Record<string, number> = {};
        for (const tier of item.tiers) {
          const shouldApply =
            (tier.tier_name === 'sedan' && applySedan) ||
            (tier.tier_name === 'truck_suv_2row' && applyTruck) ||
            (tier.tier_name === 'suv_3row_van' && applySuv);
          if (shouldApply) {
            salePrices[tier.tier_name] = calculateSalePrice(tier.price);
          }
        }
        return { type: 'service' as const, id: item.id, sale_prices: salePrices };
      }
      return {
        type: 'product' as const,
        id: item.id,
        sale_price: calculateSalePrice(item.retail_price ?? 0),
      };
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>Quick Sale</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Search to add items */}
        <FormField label="Select items">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search to add items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {searching && <p className="mt-1 text-xs text-gray-400">Searching...</p>}
          {searchResults.length > 0 && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-gray-200">
              {searchResults
                .filter((r) => !selectedItems.some((s) => s.id === r.id && s.type === r.item_type))
                .map((r) => (
                  <button
                    key={`${r.item_type}-${r.id}`}
                    onClick={() => addItem(r)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50"
                  >
                    {r.item_type === 'service' ? (
                      <Wrench className="h-3.5 w-3.5 text-gray-400" />
                    ) : (
                      <ShoppingBag className="h-3.5 w-3.5 text-gray-400" />
                    )}
                    <span>{r.name}</span>
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
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm"
                >
                  <button onClick={() => removeItem(item.id)} className="text-gray-400 hover:text-red-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <span className="flex-1 font-medium">{item.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{item.type}</Badge>
                  {item.type === 'product' && (
                    <span className="text-xs text-gray-500">{formatCurrency(item.retail_price ?? 0)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discount */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Discount type">
            <div className="flex gap-2">
              {(['percentage', 'fixed'] as const).map((t) => (
                <button
                  key={t}
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
                step={discountType === 'percentage' ? '1' : '0.01'}
                placeholder="0"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value === '' ? '' : parseFloat(e.target.value))}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                {discountType === 'percentage' ? '%' : '$'}
              </span>
            </div>
          </FormField>
        </div>

        {/* Tier checkboxes */}
        {selectedItems.some((i) => i.type === 'service') && (
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

        {/* Sale period */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Start Date">
            <Input type="date" value={saleStartsAt} onChange={(e) => setSaleStartsAt(e.target.value)} />
          </FormField>
          <FormField label="End Date">
            <Input type="date" value={saleEndsAt} onChange={(e) => setSaleEndsAt(e.target.value)} />
          </FormField>
        </div>

        {/* Preview */}
        {selectedItems.length > 0 && typeof discountValue === 'number' && discountValue > 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500">Preview</p>
            {selectedItems.map((item) => (
              <div key={item.id} className="text-sm">
                <p className="font-medium text-gray-700">{item.name}:</p>
                {item.type === 'service' && item.tiers ? (
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
                            {tier.tier_label || tier.tier_name}: {formatCurrency(tier.price)} → {formatCurrency(sp)}
                            {!valid && ' (invalid)'}
                          </p>
                        );
                      })}
                  </div>
                ) : (
                  <p className="ml-4 text-gray-600">
                    {formatCurrency(item.retail_price ?? 0)} → {formatCurrency(calculateSalePrice(item.retail_price ?? 0))}
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
          disabled={applying || selectedItems.length === 0 || typeof discountValue !== 'number' || discountValue <= 0}
        >
          {applying ? 'Applying...' : `Apply Sale to ${selectedItems.length} Item${selectedItems.length !== 1 ? 's' : ''}`}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
