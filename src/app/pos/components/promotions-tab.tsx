'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useTicket } from '../context/ticket-context';
import { Tag, Gift, TrendingUp, ChevronDown, ChevronUp, Loader2, Search, Clock, X } from 'lucide-react';
import { posFetch } from '../lib/pos-fetch';
import { Button } from '@/components/ui/button';

interface PromotionItem {
  id: string;
  code: string;
  name: string | null;
  discount_amount: number;
  description: string;
  expires_at: string | null;
  target_customer_type: string | null;
  auto_apply: boolean;
  missing_items?: string[];
  warning?: string;
}

interface PromotionsData {
  for_you: PromotionItem[];
  eligible: PromotionItem[];
  upsell: PromotionItem[];
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const then = new Date(dateStr);
  return Math.ceil((then.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt);
  if (days < 0) return null;
  if (days <= 3) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
        <Clock className="h-2.5 w-2.5" />
        {days === 0 ? 'Expires today' : `${days}d left`}
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
        <Clock className="h-2.5 w-2.5" />
        {days}d left
      </span>
    );
  }
  return null;
}

function PromotionCard({
  promo,
  accent,
  isApplied,
  onApply,
  onRemove,
  applying,
}: {
  promo: PromotionItem;
  accent: 'green' | 'blue' | 'amber';
  isApplied: boolean;
  onApply: () => void;
  onRemove: () => void;
  applying: boolean;
}) {
  const accentClasses = {
    green: 'border-l-green-500 bg-green-50/50',
    blue: 'border-l-blue-500 bg-blue-50/50',
    amber: 'border-l-amber-500 bg-amber-50/50',
  };

  return (
    <div className={`rounded-md border border-gray-200 border-l-4 p-3 ${accentClasses[accent]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-gray-900 truncate">
              {promo.name || promo.code}
            </p>
            <ExpiryBadge expiresAt={promo.expires_at} />
          </div>
          <p className="mt-0.5 text-xs text-gray-600">{promo.description}</p>
          {promo.discount_amount > 0 && (
            <p className="mt-0.5 text-xs font-medium text-gray-700">
              Save ${promo.discount_amount.toFixed(2)}
            </p>
          )}
          {promo.missing_items && promo.missing_items.length > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              Needs: {promo.missing_items.join(', ')}
            </p>
          )}
          {promo.warning && (
            <p className="mt-0.5 text-xs text-amber-600">{promo.warning}</p>
          )}
        </div>
        <div className="shrink-0">
          {isApplied ? (
            <button
              onClick={onRemove}
              className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-red-100 hover:text-red-700 transition-colors"
              title="Remove coupon"
            >
              <X className="h-3 w-3" />
              Remove
            </button>
          ) : !promo.missing_items || promo.missing_items.length === 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onApply}
              disabled={applying}
              className="h-7 px-2 text-xs"
            >
              {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: typeof Gift;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (count === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-2 text-left"
      >
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-gray-500" />
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {title}
          </span>
          <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
            {count}
          </span>
        </div>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        )}
      </button>
      {open && <div className="space-y-2 pb-3">{children}</div>}
    </div>
  );
}

interface PromotionsTabProps {
  onOpenCustomerLookup: () => void;
}

export function PromotionsTab({ onOpenCustomerLookup }: PromotionsTabProps) {
  const { ticket, dispatch } = useTicket();
  const [promotions, setPromotions] = useState<PromotionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<PromotionItem | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPromotions = useCallback(async () => {
    if (!ticket.customer) {
      setPromotions(null);
      return;
    }

    setLoading(true);
    try {
      const cartItems = ticket.items.map((item) => ({
        item_type: item.itemType as 'product' | 'service',
        product_id: item.productId || undefined,
        service_id: item.serviceId || undefined,
        category_id: item.categoryId || undefined,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        item_name: item.itemName,
      }));

      const res = await posFetch('/api/pos/promotions/available', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: ticket.customer.id,
          items: cartItems,
          subtotal: ticket.subtotal,
        }),
      });

      if (res.ok) {
        const { data } = await res.json();
        setPromotions(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [ticket.customer, ticket.items, ticket.subtotal]);

  // Debounced fetch on customer/items change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPromotions();
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchPromotions]);

  function handleRemove() {
    dispatch({ type: 'SET_COUPON', coupon: null });
    toast.info('Coupon removed');
  }

  async function handleApply(promo: PromotionItem) {
    // If a coupon is already applied, ask to replace
    if (ticket.coupon && ticket.coupon.id !== promo.id) {
      setConfirmReplace(promo);
      return;
    }
    await applyPromo(promo);
  }

  async function applyPromo(promo: PromotionItem) {
    setApplyingId(promo.id);
    setConfirmReplace(null);
    try {
      const cartItems = ticket.items.map((item) => ({
        item_type: item.itemType,
        product_id: item.productId || undefined,
        service_id: item.serviceId || undefined,
        category_id: item.categoryId || undefined,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        item_name: item.itemName,
      }));

      const res = await posFetch('/api/pos/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: promo.code,
          subtotal: ticket.subtotal,
          customer_id: ticket.customer?.id || null,
          items: cartItems,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Failed to apply coupon');
        return;
      }

      dispatch({
        type: 'SET_COUPON',
        coupon: {
          id: json.data.id,
          code: json.data.code,
          discount: json.data.total_discount,
          isAutoApplied: false,
        },
      });

      if (json.data.warning) {
        toast.warning(json.data.warning);
      } else {
        toast.success(`Coupon applied: ${json.data.description}`);
      }
    } catch {
      toast.error('Failed to apply coupon');
    } finally {
      setApplyingId(null);
    }
  }

  // No customer state
  if (!ticket.customer) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Search className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">
          Select a customer to view available promotions
        </p>
        <Button variant="outline" size="sm" onClick={onOpenCustomerLookup}>
          Find Customer
        </Button>
      </div>
    );
  }

  if (loading && !promotions) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const totalCount = promotions
    ? promotions.for_you.length + promotions.eligible.length + promotions.upsell.length
    : 0;

  return (
    <div className="h-full overflow-y-auto p-4">
      {loading && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Refreshing...
        </div>
      )}

      {totalCount === 0 && !loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-400">
          No promotions available
        </div>
      ) : (
        <div className="space-y-1">
          <CollapsibleSection
            title="For You"
            icon={Gift}
            count={promotions?.for_you.length ?? 0}
          >
            {promotions?.for_you.map((promo) => (
              <PromotionCard
                key={promo.id}
                promo={promo}
                accent="green"
                isApplied={ticket.coupon?.id === promo.id}
                onApply={() => handleApply(promo)}
                onRemove={handleRemove}
                applying={applyingId === promo.id}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title="Eligible"
            icon={Tag}
            count={promotions?.eligible.length ?? 0}
          >
            {promotions?.eligible.map((promo) => (
              <PromotionCard
                key={promo.id}
                promo={promo}
                accent="blue"
                isApplied={ticket.coupon?.id === promo.id}
                onApply={() => handleApply(promo)}
                onRemove={handleRemove}
                applying={applyingId === promo.id}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title="Upsell"
            icon={TrendingUp}
            count={promotions?.upsell.length ?? 0}
            defaultOpen={false}
          >
            {promotions?.upsell.map((promo) => (
              <PromotionCard
                key={promo.id}
                promo={promo}
                accent="amber"
                isApplied={ticket.coupon?.id === promo.id}
                onApply={() => handleApply(promo)}
                onRemove={handleRemove}
                applying={applyingId === promo.id}
              />
            ))}
          </CollapsibleSection>
        </div>
      )}

      {/* Replace coupon confirmation */}
      {confirmReplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-lg border bg-white p-4 shadow-lg">
            <p className="text-sm font-medium text-gray-900">Replace current coupon?</p>
            <p className="mt-1 text-xs text-gray-500">
              <span className="font-medium">{ticket.coupon?.code}</span> is currently applied.
              Replace with <span className="font-medium">{confirmReplace.name || confirmReplace.code}</span>?
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setConfirmReplace(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => applyPromo(confirmReplace)}
              >
                Replace
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
