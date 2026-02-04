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
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft } from 'lucide-react';

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'disable' | 'enable'>('disable');

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
      coupon.min_purchase
    );
  }

  async function handleStatusChange() {
    const newStatus = confirmAction === 'disable' ? 'disabled' : 'active';
    try {
      const res = await fetch(`/api/marketing/coupons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        const { data } = await res.json();
        setCoupon(data);
        toast.success(`Coupon ${newStatus === 'disabled' ? 'disabled' : 're-enabled'}`);
      }
    } catch {
      toast.error('Failed to update status');
    }
    setConfirmOpen(false);
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

  const statusVariant =
    coupon.status === 'active' ? 'success' :
    coupon.status === 'disabled' ? 'destructive' :
    coupon.status === 'expired' ? 'warning' :
    'secondary';

  const rewards: CouponReward[] = (coupon as any).coupon_rewards || coupon.rewards || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={coupon.name || coupon.code}
        action={
          <div className="flex gap-2">
            {coupon.status === 'active' && (
              <Button
                variant="outline"
                onClick={() => { setConfirmAction('disable'); setConfirmOpen(true); }}
              >
                Disable
              </Button>
            )}
            {coupon.status === 'disabled' && (
              <Button
                variant="outline"
                onClick={() => { setConfirmAction('enable'); setConfirmOpen(true); }}
              >
                Re-enable
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push('/admin/marketing/coupons')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      {/* Info Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Code</p>
          <p className="mt-1 font-mono text-lg font-bold">{coupon.code}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Status</p>
          <div className="mt-1">
            <Badge variant={statusVariant}>
              {COUPON_STATUS_LABELS[coupon.status]}
            </Badge>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Auto-Apply</p>
          <div className="mt-1">
            {coupon.auto_apply ? (
              <Badge variant="info">Yes</Badge>
            ) : (
              <span className="text-sm font-medium text-gray-700">No</span>
            )}
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
                  <p className="text-sm text-gray-500">Expiration</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {coupon.expires_at ? formatDate(coupon.expires_at) : 'Never'}
                  </p>
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

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmAction === 'disable' ? 'Disable Coupon' : 'Re-enable Coupon'}
        description={
          confirmAction === 'disable'
            ? 'This coupon will no longer be usable. You can re-enable it later.'
            : 'This coupon will become active again.'
        }
        confirmLabel={confirmAction === 'disable' ? 'Disable' : 'Enable'}
        variant={confirmAction === 'disable' ? 'destructive' : 'default'}
        onConfirm={handleStatusChange}
      />
    </div>
  );
}
