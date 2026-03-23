'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatPstShortDate } from '@/lib/utils/pst-date';
import {
  Plus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  PromotionRow,
} from './_components/promotion-row';
import type { PromotionItem } from './_components/promotion-row';
import { QuickSaleDialog } from './_components/quick-sale-dialog';
import type { QuickSaleItem, QuickSalePrefill } from './_components/quick-sale-dialog';
import { SaleHistorySection } from './_components/sale-history-section';
import type { SaleHistoryRecord } from '@/lib/supabase/types';
import { usePermission } from '@/lib/hooks/use-permission';

// ─── Types ──────────────────────────────────────────────────

interface Counts {
  active: number;
  scheduled: number;
  expired: number;
  no_sale: number;
}

// ─── Helpers ────────────────────────────────────────────────

/** Build a QuickSaleItem from a PromotionItem with current sale prices as prefill */
function buildPrefillFromPromotion(item: PromotionItem): QuickSaleItem {
  const tiers = item.service_pricing
    ? [...item.service_pricing].sort((a, b) => a.display_order - b.display_order)
    : undefined;

  const base: QuickSaleItem = {
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
  };

  // Pre-fill sale prices for direct mode
  if (item.item_type === 'product') {
    base.prefilled_sale_price = item.sale_price ?? null;
  } else if (item.pricing_model === 'flat' || item.pricing_model === 'per_unit') {
    base.prefilled_sale_price = item.sale_price ?? null;
  } else if (tiers) {
    const tierPrices: Record<string, number> = {};
    for (const t of tiers) {
      if (t.sale_price != null) tierPrices[t.tier_name] = t.sale_price;
    }
    if (Object.keys(tierPrices).length > 0) base.prefilled_tier_sale_prices = tierPrices;
  }

  return base;
}

// ─── Main Page ──────────────────────────────────────────────

export default function PromotionsPage() {
  const { granted: canManageCoupons, loading: permLoading } = usePermission('marketing.coupons');
  const [items, setItems] = useState<PromotionItem[]>([]);
  const [counts, setCounts] = useState<Counts>({ active: 0, scheduled: 0, expired: 0, no_sale: 0 });
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'service' | 'product'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'scheduled' | 'expired' | 'no_sale'>('all');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['active', 'scheduled', 'expired']));
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [quickSalePrefill, setQuickSalePrefill] = useState<QuickSalePrefill | null>(null);
  const [clearConfirmItem, setClearConfirmItem] = useState<PromotionItem | null>(null);
  const [clearing, setClearing] = useState(false);

  // Inline edit state
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [discardConfirmTarget, setDiscardConfirmTarget] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
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
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      setEditingRowId(null);
      fetchData();
    } catch {
      toast.error('Failed to clear sale');
    } finally {
      setClearing(false);
    }
  }

  function handleStartEdit(rowKey: string) {
    if (editingRowId && editingRowId !== rowKey) {
      setDiscardConfirmTarget(rowKey);
      return;
    }
    setEditingRowId(rowKey);
  }

  function handleConfirmDiscard() {
    if (discardConfirmTarget) {
      setEditingRowId(discardConfirmTarget);
      setDiscardConfirmTarget(null);
    }
  }

  function handleSaved() {
    setEditingRowId(null);
    fetchData();
  }

  // ─── Duplicate Handlers ──────────────────────────────────

  function handleDuplicateFromRow(item: PromotionItem) {
    const prefillItem = buildPrefillFromPromotion(item);
    setQuickSalePrefill({
      item: prefillItem,
      source: `${item.name} (current)`,
    });
    setQuickSaleOpen(true);
  }

  function handleDuplicateFromHistory(record: SaleHistoryRecord) {
    // Find the item in the loaded items array by service_id or product_id
    const matchingItem = items.find((i) =>
      (record.service_id && i.item_type === 'service' && i.id === record.service_id) ||
      (record.product_id && i.item_type === 'product' && i.id === record.product_id)
    );

    if (!matchingItem) {
      toast.error('This item no longer exists or is inactive');
      return;
    }

    // Check for pricing model mismatch
    if (record.pricing_model !== null && matchingItem.pricing_model !== record.pricing_model) {
      toast.warning('Pricing model has changed since this sale — prices may need adjustment');
    }

    // Build the QuickSaleItem from current item data
    const tiers = matchingItem.service_pricing
      ? [...matchingItem.service_pricing].sort((a, b) => a.display_order - b.display_order)
      : undefined;

    const prefillItem: QuickSaleItem = {
      type: matchingItem.item_type,
      id: matchingItem.id,
      name: matchingItem.name,
      pricing_model: matchingItem.pricing_model,
      flat_price: matchingItem.flat_price,
      per_unit_price: matchingItem.per_unit_price,
      per_unit_label: matchingItem.per_unit_label,
      tiers,
      retail_price: matchingItem.retail_price,
      sale_status: matchingItem.sale_status,
      sale_starts_at: matchingItem.sale_starts_at,
      sale_ends_at: matchingItem.sale_ends_at,
      current_sale_price: matchingItem.sale_price,
      current_tier_sale_prices: tiers?.map((t) => ({
        tier_label: t.tier_label,
        tier_name: t.tier_name,
        sale_price: t.sale_price,
      })),
    };

    // Apply sale prices from the history snapshot
    const snap = record.pricing_snapshot;
    if (record.pricing_model === 'flat' || record.pricing_model === 'per_unit') {
      prefillItem.prefilled_sale_price = snap?.sale_price ?? null;
    } else if (record.pricing_model === null) {
      // Product
      prefillItem.prefilled_sale_price = snap?.sale_price ?? null;
    } else if (Array.isArray(snap)) {
      // Tiered
      const tierPrices: Record<string, number> = {};
      for (const t of snap) {
        if (t.sale_price != null) tierPrices[t.tier_name] = t.sale_price;
      }
      if (Object.keys(tierPrices).length > 0) prefillItem.prefilled_tier_sale_prices = tierPrices;
    }

    const endedLabel = formatPstShortDate(record.ended_at);
    setQuickSalePrefill({
      item: prefillItem,
      source: `${record.service_name || record.product_name || 'Item'} (ended ${endedLabel})`,
    });
    setQuickSaleOpen(true);
  }

  function handleQuickSaleOpenChange(open: boolean) {
    setQuickSaleOpen(open);
    if (!open) setQuickSalePrefill(null);
  }

  const STATUS_SECTIONS: { key: string; label: string; emoji: string }[] = [
    { key: 'active', label: 'Active Sales', emoji: '🟢' },
    { key: 'scheduled', label: 'Scheduled', emoji: '🟡' },
    { key: 'expired', label: 'Expired (recent)', emoji: '🔴' },
    { key: 'no_sale', label: 'No Sale', emoji: '⚪' },
  ];

  if (permLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!canManageCoupons) {
    return (
      <div>
        <PageHeader title="Promotions" />
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <p className="text-lg font-medium text-gray-900">Access Denied</p>
          <p className="mt-1 text-sm text-gray-500">You do not have permission to manage promotions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promotions"
        description="Manage sale pricing across services and products"
        action={
          <Button onClick={() => { setQuickSalePrefill(null); setQuickSaleOpen(true); }}>
            <Plus className="h-4 w-4" />
            Quick Sale
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-medium">Type:</span>
              {(['all', 'service', 'product'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
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
                  type="button"
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
            if (key === 'no_sale' && statusFilter !== 'no_sale') return null;

            const isExpanded = expandedSections.has(key);

            return (
              <Card key={key}>
                <button
                  type="button"
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
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Sale Price</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Sale Period</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionItems.map((item) => {
                            const rowKey = `${item.item_type}-${item.id}`;
                            return (
                              <PromotionRow
                                key={rowKey}
                                item={item}
                                isEditing={editingRowId === rowKey}
                                onStartEdit={() => handleStartEdit(rowKey)}
                                onCancelEdit={() => setEditingRowId(null)}
                                onEndSale={() => setClearConfirmItem(item)}
                                onSaved={handleSaved}
                                onDuplicate={() => handleDuplicateFromRow(item)}
                              />
                            );
                          })}
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

      {/* Sale History */}
      <SaleHistorySection onDuplicate={handleDuplicateFromHistory} />

      {/* Discard unsaved changes confirm */}
      <ConfirmDialog
        open={!!discardConfirmTarget}
        onOpenChange={(open) => !open && setDiscardConfirmTarget(null)}
        title="Discard unsaved changes?"
        description="You have unsaved changes on the current row. Discard them and edit the new row?"
        confirmLabel="Discard"
        variant="destructive"
        onConfirm={handleConfirmDiscard}
      />

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
        onOpenChange={handleQuickSaleOpenChange}
        onApplied={fetchData}
        prefill={quickSalePrefill}
      />
    </div>
  );
}
