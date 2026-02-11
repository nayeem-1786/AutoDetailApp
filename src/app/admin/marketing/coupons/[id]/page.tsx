'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Coupon, CouponReward } from '@/lib/supabase/types';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { COUPON_STATUS_LABELS, DISCOUNT_TYPE_LABELS, APPLIES_TO_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, Check, Pencil, X } from 'lucide-react';

interface CouponStats {
  usage_count: number;
  redemption_count: number;
  revenue_attributed: number;
  top_customers: { name: string; amount: number }[];
}

export default function CouponDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();

  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [stats, setStats] = useState<CouponStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [disableOpen, setDisableOpen] = useState(false);
  const [reEnableOpen, setReEnableOpen] = useState(false);
  const [reEnableExpiryMode, setReEnableExpiryMode] = useState<'keep' | 'clear' | 'new'>('keep');
  const [reEnableExpiry, setReEnableExpiry] = useState('');

  // Inline edit states
  const [editingCode, setEditingCode] = useState(false);
  const [editCode, setEditCode] = useState('');
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [editExpiry, setEditExpiry] = useState('');
  const [inlineSaving, setInlineSaving] = useState(false);

  // Name lookups for resolving IDs to display names
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [productCategories, setProductCategories] = useState<{ id: string; name: string }[]>([]);
  const [serviceCategories, setServiceCategories] = useState<{ id: string; name: string }[]>([]);
  const [customerName, setCustomerName] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [couponRes, statsRes, productsRes, servicesRes, productCatsRes, serviceCatsRes] =
        await Promise.all([
          fetch(`/api/marketing/coupons/${id}`),
          fetch(`/api/marketing/coupons/${id}/stats`),
          supabase.from('products').select('id, name').eq('is_active', true).order('name'),
          supabase.from('services').select('id, name').eq('is_active', true).order('name'),
          supabase.from('product_categories').select('id, name').eq('is_active', true).order('name'),
          supabase.from('service_categories').select('id, name').eq('is_active', true).order('name'),
        ]);

      if (couponRes.ok) {
        const { data } = await couponRes.json();
        setCoupon(data);

        // Resolve customer name if targeting a specific customer
        if (data.customer_id) {
          const { data: customer } = await supabase
            .from('customers')
            .select('first_name, last_name')
            .eq('id', data.customer_id)
            .single();
          if (customer) {
            setCustomerName(`${customer.first_name} ${customer.last_name}`);
          }
        }
      }

      if (statsRes.ok) {
        const { data } = await statsRes.json();
        setStats(data);
      }

      if (productsRes.data) setProducts(productsRes.data);
      if (servicesRes.data) setServices(servicesRes.data);
      if (productCatsRes.data) setProductCategories(productCatsRes.data);
      if (serviceCatsRes.data) setServiceCategories(serviceCatsRes.data);

      setLoading(false);
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function getProductName(productId: string | null): string {
    if (!productId) return 'Unknown';
    const product = products.find((p) => p.id === productId);
    return product ? product.name : productId;
  }

  function getServiceName(serviceId: string | null): string {
    if (!serviceId) return 'Unknown';
    const service = services.find((s) => s.id === serviceId);
    return service ? service.name : serviceId;
  }

  function getProductCategoryName(catId: string | null): string {
    if (!catId) return 'Unknown';
    const cat = productCategories.find((c) => c.id === catId);
    return cat ? cat.name : catId;
  }

  function getServiceCategoryName(catId: string | null): string {
    if (!catId) return 'Unknown';
    const cat = serviceCategories.find((c) => c.id === catId);
    return cat ? cat.name : catId;
  }

  function formatRewardLine(r: CouponReward): string {
    // Build the discount prefix
    let prefix: string;
    if (r.discount_type === 'free') {
      prefix = 'Free';
    } else if (r.discount_type === 'percentage') {
      prefix = `${r.discount_value}% off`;
    } else {
      prefix = `${formatCurrency(r.discount_value)} off`;
    }

    // Build the target label
    let target: string;
    if (r.applies_to === 'order') {
      target = 'entire order';
    } else if (r.applies_to === 'product') {
      if (r.target_product_id) {
        target = r.target_product_name || getProductName(r.target_product_id);
      } else if (r.target_product_category_id) {
        target = r.target_product_category_name || getProductCategoryName(r.target_product_category_id);
        target += ' products';
      } else {
        target = 'any product';
      }
    } else {
      // service
      if (r.target_service_id) {
        target = r.target_service_name || getServiceName(r.target_service_id);
      } else if (r.target_service_category_id) {
        target = r.target_service_category_name || getServiceCategoryName(r.target_service_category_id);
        target += ' services';
      } else {
        target = 'any service';
      }
    }

    // Combine
    let line: string;
    if (r.discount_type === 'free') {
      line = `Free ${target}`;
    } else {
      line = `${prefix} ${target}`;
    }

    // Append max discount if set
    if (r.max_discount) {
      line += ` (max ${formatCurrency(r.max_discount)})`;
    }

    return line;
  }

  function hasConditions(): boolean {
    if (!coupon) return false;
    return !!(
      (coupon.requires_product_ids && coupon.requires_product_ids.length > 0) ||
      (coupon.requires_service_ids && coupon.requires_service_ids.length > 0) ||
      (coupon.requires_product_category_ids && coupon.requires_product_category_ids.length > 0) ||
      (coupon.requires_service_category_ids && coupon.requires_service_category_ids.length > 0) ||
      coupon.min_purchase ||
      coupon.max_customer_visits != null
    );
  }

  async function handleDisable() {
    try {
      const res = await fetch(`/api/marketing/coupons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'disabled' }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setCoupon(data);
        toast.success('Coupon disabled');
      }
    } catch {
      toast.error('Failed to disable coupon');
    }
    setDisableOpen(false);
  }

  function openReEnableDialog() {
    // Initialize the dialog state based on current expiration
    if (!coupon) return;
    const hasExpiry = !!coupon.expires_at;
    const isPast = hasExpiry && new Date(coupon.expires_at!) < new Date();

    if (!hasExpiry) {
      setReEnableExpiryMode('clear');
    } else if (isPast) {
      setReEnableExpiryMode('clear');
    } else {
      setReEnableExpiryMode('keep');
    }
    setReEnableExpiry('');
    setReEnableOpen(true);
  }

  async function handleReEnable() {
    try {
      const body: Record<string, unknown> = { status: 'active' };

      if (reEnableExpiryMode === 'clear') {
        body.expires_at = null;
      } else if (reEnableExpiryMode === 'new') {
        if (!reEnableExpiry) {
          toast.error('Please select a new expiration date');
          return;
        }
        body.expires_at = reEnableExpiry;
      }
      // 'keep' = don't send expires_at, keep existing value

      const res = await fetch(`/api/marketing/coupons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const { data } = await res.json();
        setCoupon(data);
        toast.success('Coupon re-enabled');
      }
    } catch {
      toast.error('Failed to re-enable coupon');
    }
    setReEnableOpen(false);
  }

  async function inlinePatch(updates: Record<string, unknown>) {
    setInlineSaving(true);
    try {
      const res = await fetch(`/api/marketing/coupons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const { data } = await res.json();
        setCoupon(data);
        toast.success('Updated');
        return true;
      } else {
        const { error } = await res.json();
        toast.error(error || 'Update failed');
        return false;
      }
    } catch {
      toast.error('Update failed');
      return false;
    } finally {
      setInlineSaving(false);
    }
  }

  async function saveCode() {
    const trimmed = editCode.trim().toUpperCase();
    if (!trimmed) { toast.error('Code cannot be empty'); return; }
    const ok = await inlinePatch({ code: trimmed });
    if (ok) setEditingCode(false);
  }

  async function toggleAutoApply() {
    if (!coupon) return;
    await inlinePatch({ auto_apply: !coupon.auto_apply });
  }

  async function saveExpiry() {
    const ok = await inlinePatch({ expires_at: editExpiry || null });
    if (ok) setEditingExpiry(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!coupon) {
    return <p className="py-12 text-center text-gray-500">Coupon not found.</p>;
  }

  const expired = !!coupon.expires_at && new Date(coupon.expires_at) < new Date();

  const statusVariant =
    expired ? 'warning' :
    coupon.status === 'active' ? 'success' :
    coupon.status === 'disabled' ? 'destructive' :
    'secondary';

  const rewards: CouponReward[] = (coupon as any).coupon_rewards || coupon.rewards || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={coupon.name || coupon.code}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/admin/marketing/coupons/new?edit=${id}`)}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => router.push('/admin/marketing/coupons')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      {/* Info Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Code — inline editable */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Code</p>
            {!editingCode && (
              <button
                type="button"
                onClick={() => { setEditCode(coupon.code); setEditingCode(true); }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {editingCode ? (
            <div className="mt-1 flex items-center gap-1.5">
              <input
                type="text"
                value={editCode}
                onChange={(e) => setEditCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm uppercase focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') saveCode(); if (e.key === 'Escape') setEditingCode(false); }}
              />
              <button onClick={saveCode} disabled={inlineSaving} className="rounded p-1 text-green-600 hover:bg-green-50">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={() => setEditingCode(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="mt-1 font-mono text-lg font-bold">{coupon.code || <span className="text-sm font-normal text-gray-400 italic">Auto-Generated</span>}</p>
          )}
        </div>

        {/* Status — toggle slider */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Status</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              disabled={inlineSaving || expired}
              onClick={() => {
                if (coupon.status === 'active') setDisableOpen(true);
                else if (coupon.status === 'disabled') openReEnableDialog();
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                coupon.status === 'active' ? 'bg-green-500' : 'bg-gray-200'
              }`}
              role="switch"
              aria-checked={coupon.status === 'active'}
              aria-label="Toggle coupon status"
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                  coupon.status === 'active' ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <Badge variant={statusVariant}>
              {expired ? 'Expired' : (COUPON_STATUS_LABELS[coupon.status] || coupon.status)}
            </Badge>
          </div>
        </div>

        {/* Auto-Apply — toggle slider */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Auto-Apply</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              disabled={inlineSaving}
              onClick={toggleAutoApply}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                coupon.auto_apply ? 'bg-green-500' : 'bg-gray-200'
              }`}
              role="switch"
              aria-checked={coupon.auto_apply}
              aria-label="Toggle auto-apply"
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                  coupon.auto_apply ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm font-medium text-gray-700">
              {coupon.auto_apply ? 'On' : 'Off'}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Created</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{formatDate(coupon.created_at)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Targeting, Conditions, Rewards */}
        <div className="space-y-6 lg:col-span-2">
          {/* Targeting Card (WHO) */}
          <Card>
            <CardHeader>
              <CardTitle>Targeting</CardTitle>
            </CardHeader>
            <CardContent>
              {coupon.customer_id ? (
                <div>
                  <p className="text-sm text-gray-500">Specific Customer</p>
                  <p className="mt-1 font-medium text-gray-900">
                    {customerName || coupon.customer_id}
                  </p>
                </div>
              ) : coupon.customer_tags && coupon.customer_tags.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm text-gray-500">
                    Customer Tags (match {coupon.tag_match_mode === 'all' ? 'ALL' : 'ANY'})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {coupon.customer_tags.map((tag) => (
                      <Badge key={tag} variant="default">{tag}</Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Everyone -- no targeting restrictions</p>
              )}
            </CardContent>
          </Card>

          {/* Conditions Card (IF) */}
          <Card>
            <CardHeader>
              <CardTitle>Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              {!hasConditions() ? (
                <p className="text-sm text-gray-500">
                  No conditions -- works on any order
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase text-gray-400">
                    Logic: {coupon.condition_logic === 'and' ? 'ALL conditions must be met (AND)' : 'ANY condition must be met (OR)'}
                  </p>
                  <div className="space-y-2">
                    {coupon.requires_product_ids && coupon.requires_product_ids.length > 0 && (
                      <div className="flex items-start gap-2 text-sm">
                        <Badge variant="default" className="mt-0.5 shrink-0">Product</Badge>
                        <span className="text-gray-700">
                          {coupon.requires_product_ids.length === 1
                            ? `Requires: ${getProductName(coupon.requires_product_ids[0])}`
                            : `Requires any of: ${coupon.requires_product_ids.map((id) => getProductName(id)).join(', ')}`}
                        </span>
                      </div>
                    )}
                    {coupon.requires_service_ids && coupon.requires_service_ids.length > 0 && (
                      <div className="flex items-start gap-2 text-sm">
                        <Badge variant="default" className="mt-0.5 shrink-0">Service</Badge>
                        <span className="text-gray-700">
                          {coupon.requires_service_ids.length === 1
                            ? `Requires: ${getServiceName(coupon.requires_service_ids[0])}`
                            : `Requires any of: ${coupon.requires_service_ids.map((id) => getServiceName(id)).join(', ')}`}
                        </span>
                      </div>
                    )}
                    {coupon.requires_product_category_ids && coupon.requires_product_category_ids.length > 0 && (
                      <div className="flex items-start gap-2 text-sm">
                        <Badge variant="default" className="mt-0.5 shrink-0">Product Category</Badge>
                        <span className="text-gray-700">
                          {coupon.requires_product_category_ids.length === 1
                            ? `Requires: ${getProductCategoryName(coupon.requires_product_category_ids[0])}`
                            : `Requires any of: ${coupon.requires_product_category_ids.map((id) => getProductCategoryName(id)).join(', ')}`}
                        </span>
                      </div>
                    )}
                    {coupon.requires_service_category_ids && coupon.requires_service_category_ids.length > 0 && (
                      <div className="flex items-start gap-2 text-sm">
                        <Badge variant="default" className="mt-0.5 shrink-0">Service Category</Badge>
                        <span className="text-gray-700">
                          {coupon.requires_service_category_ids.length === 1
                            ? `Requires: ${getServiceCategoryName(coupon.requires_service_category_ids[0])}`
                            : `Requires any of: ${coupon.requires_service_category_ids.map((id) => getServiceCategoryName(id)).join(', ')}`}
                        </span>
                      </div>
                    )}
                    {coupon.min_purchase && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="default">Min Purchase</Badge>
                        <span className="text-gray-700">
                          {formatCurrency(coupon.min_purchase)}
                        </span>
                      </div>
                    )}
                    {coupon.max_customer_visits != null && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="default">Customer Visits</Badge>
                        <span className="text-gray-700">
                          {coupon.max_customer_visits === 0
                            ? 'New customers only'
                            : `${coupon.max_customer_visits} or fewer visits`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rewards Card (THEN) */}
          <Card>
            <CardHeader>
              <CardTitle>Rewards</CardTitle>
            </CardHeader>
            <CardContent>
              {rewards.length === 0 ? (
                <p className="text-sm text-gray-500">No rewards configured</p>
              ) : (
                <div className="space-y-3">
                  {rewards.map((r, idx) => (
                    <div
                      key={r.id || idx}
                      className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
                    >
                      <Badge variant="info">
                        {APPLIES_TO_LABELS[r.applies_to] || r.applies_to}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {formatRewardLine(r)}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {DISCOUNT_TYPE_LABELS[r.discount_type] || r.discount_type}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Limits Card */}
          <Card>
            <CardHeader>
              <CardTitle>Limits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Expiration</p>
                    {!editingExpiry && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditExpiry(coupon.expires_at ? coupon.expires_at.slice(0, 16) : '');
                          setEditingExpiry(true);
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {editingExpiry ? (
                    <div className="mt-1 space-y-2">
                      <input
                        type="datetime-local"
                        value={editExpiry}
                        onChange={(e) => setEditExpiry(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                        autoFocus
                      />
                      <div className="flex items-center gap-1.5">
                        <button onClick={saveExpiry} disabled={inlineSaving} className="rounded p-1 text-green-600 hover:bg-green-50">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditingExpiry(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                          <X className="h-4 w-4" />
                        </button>
                        {editExpiry && (
                          <button
                            onClick={() => setEditExpiry('')}
                            className="ml-1 text-xs text-red-600 hover:text-red-800"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {coupon.expires_at ? formatDate(coupon.expires_at) : 'Never'}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-500">Single Use</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {coupon.is_single_use ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Max Uses</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {coupon.max_uses ? `${coupon.use_count} / ${coupon.max_uses}` : 'Unlimited'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Performance */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Times Used</p>
                  <p className="text-2xl font-bold">{stats?.usage_count ?? coupon.use_count}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Revenue Attributed</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats?.revenue_attributed ?? 0)}</p>
                </div>
                {stats?.top_customers && stats.top_customers.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-700">Top Customers</p>
                    <div className="space-y-1">
                      {stats.top_customers.map((c, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-600">{c.name}</span>
                          <span className="font-medium">{formatCurrency(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Disable confirm dialog */}
      <ConfirmDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        title="Disable Coupon"
        description="This coupon will no longer be usable. You can re-enable it later."
        confirmLabel="Disable"
        variant="destructive"
        onConfirm={handleDisable}
      />

      {/* Re-enable dialog with expiration options */}
      <Dialog open={reEnableOpen} onOpenChange={setReEnableOpen}>
        <DialogHeader>
          <DialogTitle>Re-enable Coupon</DialogTitle>
          <DialogDescription>
            This coupon will become active again. Review the expiration date before re-enabling.
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          {(() => {
            const hasExpiry = !!coupon.expires_at;
            const isPast = hasExpiry && new Date(coupon.expires_at!) < new Date();

            return (
              <div className="space-y-4">
                {/* Current expiration status */}
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-700">Current Expiration</p>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {!hasExpiry
                      ? 'No expiration set'
                      : isPast
                        ? `Expired on ${formatDate(coupon.expires_at!)} (already passed)`
                        : `Expires ${formatDate(coupon.expires_at!)}`}
                  </p>
                </div>

                {/* Radio options */}
                <div className="space-y-2">
                  {hasExpiry && !isPast && (
                    <label className="flex items-center gap-2 rounded-md border border-gray-200 p-3 cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="re-enable-expiry"
                        checked={reEnableExpiryMode === 'keep'}
                        onChange={() => setReEnableExpiryMode('keep')}
                        className="h-4 w-4 text-gray-900"
                      />
                      <span className="text-sm text-gray-700">Keep current date ({formatDate(coupon.expires_at!)})</span>
                    </label>
                  )}
                  <label className="flex items-center gap-2 rounded-md border border-gray-200 p-3 cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="re-enable-expiry"
                      checked={reEnableExpiryMode === 'clear'}
                      onChange={() => setReEnableExpiryMode('clear')}
                      className="h-4 w-4 text-gray-900"
                    />
                    <span className="text-sm text-gray-700">Remove expiration (never expires)</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-gray-200 p-3 cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="re-enable-expiry"
                      checked={reEnableExpiryMode === 'new'}
                      onChange={() => setReEnableExpiryMode('new')}
                      className="h-4 w-4 text-gray-900"
                    />
                    <span className="text-sm text-gray-700">Set a new expiration date</span>
                  </label>
                </div>

                {/* Date picker when "new" is selected */}
                {reEnableExpiryMode === 'new' && (
                  <div>
                    <input
                      type="datetime-local"
                      value={reEnableExpiry}
                      onChange={(e) => setReEnableExpiry(e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    />
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setReEnableOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleReEnable}>
            Re-enable
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
