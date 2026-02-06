'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Quote, QuoteItem, QuoteStatus, Customer, Vehicle, Service, ServicePricing } from '@/lib/supabase/types';
import { formatCurrency, formatDate, formatDateTime, formatPhone } from '@/lib/utils/format';
import { TAX_RATE, QUOTE_STATUS_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { VEHICLE_SIZE_LABELS, VEHICLE_TYPE_LABELS, VEHICLE_TYPE_SIZE_CLASSES } from '@/lib/utils/constants';
import { ArrowLeft, Save, Send, ArrowRightCircle, Plus, Trash2, Car, Mail, MessageSquare, CheckCircle, AlertCircle, Copy, User, Calendar, DollarSign, Award, Clock } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

type QuoteWithRelations = Quote & {
  customer?: Customer | null;
  vehicle?: Vehicle | null;
  items?: QuoteItem[];
};

interface LineItem {
  key: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  service_id: string | null;
  product_id: string | null;
  tier_name: string | null;
  notes: string | null;
}

const STATUS_BADGE_VARIANT: Record<QuoteStatus, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'default',
  sent: 'info',
  viewed: 'warning',
  accepted: 'success',
  expired: 'destructive',
  converted: 'secondary',
};

function generateKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function QuoteDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();

  const [quote, setQuote] = useState<QuoteWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Edit state (only for draft quotes)
  const [items, setItems] = useState<LineItem[]>([]);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  // Send dialog
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendMethod, setSendMethod] = useState<'email' | 'sms' | 'both'>('email');
  const [sending, setSending] = useState(false);

  // Convert dialog
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertDate, setConvertDate] = useState('');
  const [convertTime, setConvertTime] = useState('');
  const [convertDuration, setConvertDuration] = useState(60);
  const [converting, setConverting] = useState(false);

  // Add vehicle dialog
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    vehicle_type: 'standard',
    size_class: '',
    year: '',
    make: '',
    model: '',
    color: '',
  });
  const [addingVehicle, setAddingVehicle] = useState(false);

  // Communication history
  const [communications, setCommunications] = useState<{
    id: string;
    channel: 'email' | 'sms';
    sent_to: string;
    status: 'sent' | 'failed';
    error_message: string | null;
    created_at: string;
  }[]>([]);

  // Customer stats
  const [customerStats, setCustomerStats] = useState<{
    visitCount: number;
    lifetimeSpend: number;
    loyaltyPoints: number;
    lastVisit: string | null;
    memberSince: string | null;
  } | null>(null);

  const isDraft = quote?.status === 'draft';
  const isAccepted = quote?.status === 'accepted';

  const loadQuote = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('quotes')
      .select(
        `
        *,
        customer:customers(*),
        vehicle:vehicles(*),
        items:quote_items(*)
      `
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('Error loading quote:', error);
      setLoading(false);
      return;
    }

    const q = data as QuoteWithRelations;
    setQuote(q);

    // Populate edit state
    setItems(
      (q.items || []).map((item) => ({
        key: generateKey(),
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        service_id: item.service_id,
        product_id: item.product_id,
        tier_name: item.tier_name,
        notes: item.notes,
      }))
    );
    if (q.valid_until) {
      setValidUntil(q.valid_until.split('T')[0]);
    } else {
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 10);
      setValidUntil(defaultDate.toISOString().split('T')[0]);
    }
    setNotes(q.notes || '');
    setVehicleId(q.vehicle_id || '');

    // Load vehicles for this customer
    if (q.customer_id) {
      const { data: vData } = await supabase
        .from('vehicles')
        .select('*')
        .eq('customer_id', q.customer_id)
        .order('created_at', { ascending: false });
      if (vData) setVehicles(vData);
    }

    // Load communication history
    const { data: commData } = await supabase
      .from('quote_communications')
      .select('*')
      .eq('quote_id', id)
      .order('created_at', { ascending: false });
    if (commData) setCommunications(commData);

    // Load customer stats if customer exists
    if (q.customer_id) {
      // Get transaction stats
      const { data: txData } = await supabase
        .from('transactions')
        .select('total_amount, created_at')
        .eq('customer_id', q.customer_id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      const transactions = txData || [];
      const loyaltyPoints = (q.customer as Customer | null)?.loyalty_points_balance ?? 0;
      const lifetimeSpend = transactions.reduce((sum: number, tx: { total_amount: number | null }) => sum + (tx.total_amount || 0), 0);

      setCustomerStats({
        visitCount: transactions.length,
        lifetimeSpend,
        loyaltyPoints,
        lastVisit: transactions[0]?.created_at || null,
        memberSince: q.customer?.created_at || null,
      });
    }

    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    loadQuote();
  }, [loadQuote]);

  useEffect(() => {
    async function loadServices() {
      const { data } = await supabase
        .from('services')
        .select('id, name, flat_price, pricing_model, is_active, pricing:service_pricing(id, tier_name, tier_label, price, is_vehicle_size_aware, vehicle_size_sedan_price, vehicle_size_truck_suv_price, vehicle_size_suv_van_price, display_order)')
        .eq('is_active', true)
        .order('name');
      if (data) setServices(data as (Service & { pricing: ServicePricing[] })[]);
    }
    loadServices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Line item management
  function addItem() {
    setItems((prev) => [
      ...prev,
      { key: generateKey(), item_name: '', quantity: 1, unit_price: 0, service_id: null, product_id: null, tier_name: null, notes: null },
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  function updateItem(key: string, field: keyof LineItem, value: string | number | null) {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: value } : item))
    );
  }

  // Get the selected vehicle's size class (if any)
  const selectedVehicleSizeClass = useMemo(() => {
    if (!vehicleId) return null;
    const v = vehicles.find((v) => v.id === vehicleId);
    return v?.size_class ?? null;
  }, [vehicleId, vehicles]);

  function getServicePriceTiers(service: Service & { pricing?: ServicePricing[] }): ServicePricing[] {
    return (service.pricing ?? []).sort((a, b) => a.display_order - b.display_order);
  }

  function resolveTierPrice(tier: ServicePricing, sizeClass: string | null): number {
    if (tier.is_vehicle_size_aware && sizeClass) {
      if (sizeClass === 'sedan' && tier.vehicle_size_sedan_price != null) return tier.vehicle_size_sedan_price;
      if (sizeClass === 'truck_suv_2row' && tier.vehicle_size_truck_suv_price != null) return tier.vehicle_size_truck_suv_price;
      if (sizeClass === 'suv_3row_van' && tier.vehicle_size_suv_van_price != null) return tier.vehicle_size_suv_van_price;
    }
    return tier.price;
  }

  function handleServiceSelect(key: string, serviceId: string) {
    const service = services.find((s) => s.id === serviceId) as (Service & { pricing?: ServicePricing[] }) | undefined;
    if (!service) {
      setItems((prev) =>
        prev.map((item) => item.key === key ? { ...item, service_id: null, item_name: '', unit_price: 0, tier_name: null } : item)
      );
      return;
    }

    const tiers = getServicePriceTiers(service);

    if (service.pricing_model === 'flat' || tiers.length === 0) {
      setItems((prev) =>
        prev.map((item) => {
          if (item.key !== key) return item;
          return { ...item, service_id: serviceId, product_id: null, item_name: service.name, unit_price: service.flat_price ?? 0, tier_name: null };
        })
      );
    } else {
      const firstTier = tiers[0];
      const price = resolveTierPrice(firstTier, selectedVehicleSizeClass);
      setItems((prev) =>
        prev.map((item) => {
          if (item.key !== key) return item;
          return { ...item, service_id: serviceId, product_id: null, item_name: service.name, unit_price: price, tier_name: firstTier.tier_name };
        })
      );
    }
  }

  function handleTierSelect(key: string, tierName: string) {
    const item = items.find((i) => i.key === key);
    if (!item?.service_id) return;

    const service = services.find((s) => s.id === item.service_id) as (Service & { pricing?: ServicePricing[] }) | undefined;
    if (!service) return;

    const tier = (service.pricing ?? []).find((t) => t.tier_name === tierName);
    if (!tier) return;

    const price = resolveTierPrice(tier, selectedVehicleSizeClass);
    setItems((prev) =>
      prev.map((i) => i.key === key ? { ...i, tier_name: tierName, unit_price: price } : i)
    );
  }

  function handleItemSizeClassChange(key: string, sizeClass: string) {
    const item = items.find((i) => i.key === key);
    if (!item?.service_id || !item.tier_name) return;

    const service = services.find((s) => s.id === item.service_id) as (Service & { pricing?: ServicePricing[] }) | undefined;
    if (!service) return;

    const tier = (service.pricing ?? []).find((t) => t.tier_name === item.tier_name);
    if (!tier || !tier.is_vehicle_size_aware) return;

    const price = resolveTierPrice(tier, sizeClass || null);
    setItems((prev) =>
      prev.map((i) => i.key === key ? { ...i, unit_price: price } : i)
    );
  }

  // Totals
  const { subtotal, taxAmount, total } = useMemo(() => {
    const sub = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const taxable = items.reduce((sum, item) => {
      if (item.product_id) return sum + item.quantity * item.unit_price;
      return sum;
    }, 0);
    const tax = Math.round(taxable * TAX_RATE * 100) / 100;
    return {
      subtotal: Math.round(sub * 100) / 100,
      taxAmount: tax,
      total: Math.round((sub + tax) * 100) / 100,
    };
  }, [items]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    const validItems = items.filter((item) => item.item_name.trim());
    if (validItems.length === 0) newErrors.items = 'At least one item is required';
    items.forEach((item, i) => {
      if (!item.item_name.trim()) newErrors[`item_${i}_name`] = 'Item name is required';
      if (item.unit_price <= 0) newErrors[`item_${i}_price`] = 'Price must be greater than 0';
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);

    try {
      const payload = {
        vehicle_id: vehicleId || null,
        items: items
          .filter((item) => item.item_name.trim())
          .map((item) => ({
            item_name: item.item_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            service_id: item.service_id || null,
            product_id: item.product_id || null,
            tier_name: item.tier_name || null,
            notes: item.notes || null,
          })),
        notes: notes || null,
        valid_until: validUntil || null,
      };

      const res = await fetch(`/api/quotes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to update quote');
      } else {
        toast.success('Quote saved successfully');
        await loadQuote();
      }
    } catch {
      toast.error('An error occurred while saving');
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    setSending(true);
    try {
      const res = await fetch(`/api/quotes/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: sendMethod }),
      });
      const data = await res.json();
      if (res.ok) {
        const sentChannels = (data.sent_via || []).join(' & ');
        const errors = data.errors || [];

        // Copy link to clipboard
        if (data.link) {
          await navigator.clipboard.writeText(data.link).catch(() => {});
        }

        // Show success toast
        if (sentChannels) {
          toast.success(`Estimate sent via ${sentChannels}`, {
            description: data.link ? 'Link copied to clipboard' : undefined,
            icon: <CheckCircle className="h-4 w-4" />,
          });
        } else {
          toast.success('Estimate marked as sent', {
            description: data.link ? 'Link copied to clipboard' : undefined,
          });
        }

        // Show warnings as separate toasts
        for (const err of errors) {
          toast.warning(err, {
            icon: <AlertCircle className="h-4 w-4" />,
          });
        }

        setShowSendDialog(false);
        await loadQuote();
      } else {
        toast.error(data.error || 'Failed to send estimate');
      }
    } catch {
      toast.error('An error occurred while sending');
    } finally {
      setSending(false);
    }
  }

  async function handleConvert() {
    if (!convertDate || !convertTime) return;
    setConverting(true);

    try {
      const res = await fetch(`/api/quotes/${id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: convertDate,
          time: convertTime,
          duration_minutes: convertDuration,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setShowConvertDialog(false);
        toast.success('Appointment created successfully');
        if (data.appointment?.id) {
          router.push(`/admin/appointments`);
        } else {
          await loadQuote();
        }
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to convert quote');
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setConverting(false);
    }
  }

  async function handleAddVehicle() {
    if (!quote?.customer_id) return;
    if (!newVehicle.make && !newVehicle.model) return;

    setAddingVehicle(true);
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .insert({
          customer_id: quote.customer_id,
          vehicle_type: newVehicle.vehicle_type || 'standard',
          size_class: newVehicle.size_class || null,
          year: newVehicle.year ? parseInt(newVehicle.year) : null,
          make: newVehicle.make || null,
          model: newVehicle.model || null,
          color: newVehicle.color || null,
        })
        .select('*')
        .single();

      if (error || !data) {
        toast.error('Failed to add vehicle');
        return;
      }

      setVehicles((prev) => [data, ...prev]);
      setVehicleId(data.id);
      setShowAddVehicle(false);
      setNewVehicle({ vehicle_type: 'standard', size_class: '', year: '', make: '', model: '', color: '' });
      toast.success('Vehicle added');
    } catch {
      toast.error('An error occurred while adding the vehicle');
    } finally {
      setAddingVehicle(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="space-y-6">
        <PageHeader title="Quote Not Found" />
        <p className="text-sm text-gray-500">The quote you are looking for does not exist.</p>
        <Button variant="outline" onClick={() => router.push('/admin/quotes')}>
          Back to Quotes
        </Button>
      </div>
    );
  }

  // Read-only view for non-draft quotes
  if (!isDraft) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Quote ${quote.quote_number}`}
          action={
            <div className="flex items-center gap-3">
              <Badge variant={STATUS_BADGE_VARIANT[quote.status]}>
                {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
              </Badge>
              {isAccepted && (
                <Button onClick={() => setShowConvertDialog(true)}>
                  <ArrowRightCircle className="h-4 w-4" />
                  Convert to Appointment
                </Button>
              )}
              <Button variant="outline" onClick={() => router.push('/admin/quotes')}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
          }
        />

        {/* Customer Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Customer</CardTitle>
              {quote.customer && (
                <Link
                  href={`/admin/customers/${quote.customer.id}`}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  View Profile →
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {quote.customer ? (
              <div className="space-y-4">
                {/* Name and Type */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-gray-400" />
                    <p className="text-base font-semibold text-gray-900">
                      {quote.customer.first_name} {quote.customer.last_name}
                    </p>
                  </div>
                  {quote.customer.customer_type && (
                    <Badge variant={quote.customer.customer_type === 'professional' ? 'info' : 'default'}>
                      {quote.customer.customer_type === 'professional' ? 'Professional' : 'Enthusiast'}
                    </Badge>
                  )}
                </div>

                {/* Contact Info */}
                <div className="grid grid-cols-2 gap-3 rounded-md bg-gray-50 p-3">
                  <div>
                    <p className="text-xs text-gray-500">Phone</p>
                    <p className="text-sm font-medium text-gray-900">
                      {quote.customer.phone ? formatPhone(quote.customer.phone) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {quote.customer.email || '—'}
                    </p>
                  </div>
                </div>

                {/* Stats */}
                {customerStats && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 rounded-md border border-gray-100 p-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Member Since</p>
                        <p className="text-sm font-medium text-gray-900">
                          {customerStats.memberSince ? formatDate(customerStats.memberSince) : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-md border border-gray-100 p-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Last Visit</p>
                        <p className="text-sm font-medium text-gray-900">
                          {customerStats.lastVisit ? formatDate(customerStats.lastVisit) : 'Never'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-md border border-gray-100 p-2">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-xs text-gray-500">Lifetime Spend</p>
                        <p className="text-sm font-medium text-gray-900">
                          {formatCurrency(customerStats.lifetimeSpend)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-md border border-gray-100 p-2">
                      <Award className="h-4 w-4 text-amber-500" />
                      <div>
                        <p className="text-xs text-gray-500">Loyalty Points</p>
                        <p className="text-sm font-medium text-gray-900">
                          {customerStats.loyaltyPoints.toLocaleString()} pts
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Visit Count Badge */}
                {customerStats && customerStats.visitCount > 0 && (
                  <p className="text-xs text-gray-500">
                    {customerStats.visitCount} {customerStats.visitCount === 1 ? 'visit' : 'visits'} on record
                  </p>
                )}

                {/* Vehicle */}
                {quote.vehicle && (
                  <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <Car className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Vehicle</p>
                      <p className="text-sm font-medium text-gray-900">
                        {[quote.vehicle.year, quote.vehicle.make, quote.vehicle.model].filter(Boolean).join(' ')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Unknown customer</p>
            )}
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-2 text-left font-medium text-gray-500">Item</th>
                    <th className="pb-2 text-center font-medium text-gray-500">Qty</th>
                    <th className="pb-2 text-right font-medium text-gray-500">Unit Price</th>
                    <th className="pb-2 text-right font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(quote.items || []).map((item) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-3">
                        <div className="font-medium text-gray-900">{item.item_name}</div>
                        {item.tier_name && (
                          <div className="text-xs text-gray-500">{item.tier_name}</div>
                        )}
                        {item.notes && (
                          <div className="text-xs text-gray-400">{item.notes}</div>
                        )}
                      </td>
                      <td className="py-3 text-center text-gray-600">{item.quantity}</td>
                      <td className="py-3 text-right text-gray-600">
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td className="py-3 text-right font-medium text-gray-900">
                        {formatCurrency(item.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-2 border-t border-gray-200 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatCurrency(quote.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax</span>
                <span className="font-medium">{formatCurrency(quote.tax_amount)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base">
                <span className="font-semibold">Total</span>
                <span className="font-bold">{formatCurrency(quote.total_amount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Details & Communication */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Created:</span>{' '}
                <span className="text-gray-900">{formatDate(quote.created_at)}</span>
              </div>
              {quote.valid_until && (
                <div>
                  <span className="text-gray-500">Valid Until:</span>{' '}
                  <span className="text-gray-900">{formatDate(quote.valid_until)}</span>
                </div>
              )}
              {quote.viewed_at && (
                <div>
                  <span className="text-gray-500">Viewed:</span>{' '}
                  <span className="text-gray-900">{formatDate(quote.viewed_at)}</span>
                </div>
              )}
              {quote.accepted_at && (
                <div>
                  <span className="text-gray-500">Accepted:</span>{' '}
                  <span className="text-gray-900">{formatDate(quote.accepted_at)}</span>
                </div>
              )}
            </div>
            {quote.notes && (
              <div>
                <span className="text-sm text-gray-500">Notes:</span>
                <p className="mt-1 text-sm text-gray-700">{quote.notes}</p>
              </div>
            )}

            {/* Last Contacted & Resend */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Last Contacted</p>
                  {quote.sent_at ? (
                    <p className="text-sm text-gray-500">{formatDateTime(quote.sent_at)}</p>
                  ) : (
                    <p className="text-sm text-gray-400">Never sent</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSendDialog(true)}
                >
                  <Send className="h-4 w-4" />
                  {quote.sent_at ? 'Resend' : 'Send'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Communication History */}
        <Card>
          <CardHeader>
            <CardTitle>Communication History</CardTitle>
          </CardHeader>
          <CardContent>
            {communications.length === 0 ? (
              <p className="text-sm text-gray-400">No messages sent yet</p>
            ) : (
              <div className="space-y-3">
                {communications.map((comm) => (
                  <div
                    key={comm.id}
                    className="flex items-start justify-between rounded-md border border-gray-100 bg-gray-50 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 rounded-full p-1.5 ${comm.channel === 'email' ? 'bg-blue-100' : 'bg-green-100'}`}>
                        {comm.channel === 'email' ? (
                          <Mail className={`h-4 w-4 ${comm.status === 'sent' ? 'text-blue-600' : 'text-red-500'}`} />
                        ) : (
                          <MessageSquare className={`h-4 w-4 ${comm.status === 'sent' ? 'text-green-600' : 'text-red-500'}`} />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {comm.channel === 'email' ? 'Email' : 'SMS'}{' '}
                          {comm.status === 'sent' ? 'sent' : 'failed'}
                        </p>
                        <p className="text-xs text-gray-500">
                          To: {comm.channel === 'email' ? comm.sent_to : formatPhone(comm.sent_to)}
                        </p>
                        {comm.error_message && (
                          <p className="mt-1 text-xs text-red-500">{comm.error_message}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">{formatDateTime(comm.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Convert to Appointment Dialog */}
        <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
          <DialogHeader>
            <DialogTitle>Convert to Appointment</DialogTitle>
          </DialogHeader>
          <DialogContent className="space-y-4">
            <FormField label="Date" required>
              <Input
                type="date"
                value={convertDate}
                onChange={(e) => setConvertDate(e.target.value)}
              />
            </FormField>
            <FormField label="Time" required>
              <Input
                type="time"
                value={convertTime}
                onChange={(e) => setConvertTime(e.target.value)}
              />
            </FormField>
            <FormField label="Duration (minutes)">
              <Input
                type="number"
                min={15}
                step={15}
                value={convertDuration}
                onChange={(e) => setConvertDuration(parseInt(e.target.value) || 60)}
              />
            </FormField>
          </DialogContent>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvertDialog(false)} disabled={converting}>
              Cancel
            </Button>
            <Button onClick={handleConvert} disabled={converting || !convertDate || !convertTime}>
              {converting ? <Spinner size="sm" /> : <ArrowRightCircle className="h-4 w-4" />}
              Create Appointment
            </Button>
          </DialogFooter>
        </Dialog>

        {/* Send/Resend Estimate Dialog */}
        <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
          <DialogHeader>
            <DialogTitle>{quote.sent_at ? 'Resend Estimate' : 'Send Estimate'}</DialogTitle>
          </DialogHeader>
          <DialogContent className="space-y-4">
            <p className="text-sm text-gray-600">
              How would you like to send this estimate to{' '}
              <span className="font-medium">{quote.customer?.first_name} {quote.customer?.last_name}</span>?
            </p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                <input
                  type="radio"
                  name="sendMethod"
                  value="email"
                  checked={sendMethod === 'email'}
                  onChange={() => setSendMethod('email')}
                />
                <Mail className="h-5 w-5 text-gray-500" />
                <div>
                  <div className="text-sm font-medium">Email</div>
                  <div className="text-xs text-gray-500">
                    {quote.customer?.email || 'No email on file'}
                  </div>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                <input
                  type="radio"
                  name="sendMethod"
                  value="sms"
                  checked={sendMethod === 'sms'}
                  onChange={() => setSendMethod('sms')}
                />
                <MessageSquare className="h-5 w-5 text-gray-500" />
                <div>
                  <div className="text-sm font-medium">SMS (with PDF)</div>
                  <div className="text-xs text-gray-500">
                    {quote.customer?.phone || 'No phone on file'}
                  </div>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                <input
                  type="radio"
                  name="sendMethod"
                  value="both"
                  checked={sendMethod === 'both'}
                  onChange={() => setSendMethod('both')}
                />
                <Send className="h-5 w-5 text-gray-500" />
                <div>
                  <div className="text-sm font-medium">Both Email & SMS</div>
                  <div className="text-xs text-gray-500">Send via all available channels</div>
                </div>
              </label>
            </div>
          </DialogContent>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendDialog(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
              {quote.sent_at ? 'Resend' : 'Send'}
            </Button>
          </DialogFooter>
        </Dialog>
      </div>
    );
  }

  // Editable draft view
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit Quote ${quote.quote_number}`}
        action={
          <div className="flex items-center gap-3">
            <Badge variant="default">Draft</Badge>
            <Button variant="outline" onClick={() => router.push('/admin/quotes')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      {/* Customer Info (read-only for edit) */}
      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent>
          {quote.customer ? (
            <div className="flex items-center gap-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {quote.customer.first_name} {quote.customer.last_name}
                </p>
                {quote.customer.phone && (
                  <p className="text-xs text-gray-500">{formatPhone(quote.customer.phone)}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Unknown customer</p>
          )}
          <div className="mt-4">
            <FormField label="Vehicle">
              <div className="flex items-center gap-2">
                <Select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="flex-1"
                >
                  <option value="">Select a vehicle...</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {[v.year, v.make, v.model, v.color].filter(Boolean).join(' ')}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddVehicle(true)}
                >
                  <Car className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </FormField>
          </div>
        </CardContent>
      </Card>

      {/* Add Vehicle Dialog */}
      <Dialog open={showAddVehicle} onOpenChange={setShowAddVehicle}>
        <DialogHeader>
          <DialogTitle>Add Vehicle</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Vehicle Type">
              <Select
                value={newVehicle.vehicle_type}
                onChange={(e) => setNewVehicle((prev) => ({ ...prev, vehicle_type: e.target.value, size_class: '' }))}
              >
                {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </FormField>
            {(VEHICLE_TYPE_SIZE_CLASSES[newVehicle.vehicle_type] ?? []).length > 0 && (
              <FormField label="Size Class">
                <Select
                  value={newVehicle.size_class}
                  onChange={(e) => setNewVehicle((prev) => ({ ...prev, size_class: e.target.value }))}
                >
                  <option value="">Select size...</option>
                  {(VEHICLE_TYPE_SIZE_CLASSES[newVehicle.vehicle_type] ?? []).map((sc) => (
                    <option key={sc} value={sc}>{VEHICLE_SIZE_LABELS[sc] ?? sc}</option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Year">
              <Input
                type="number"
                placeholder="2024"
                value={newVehicle.year}
                onChange={(e) => setNewVehicle((prev) => ({ ...prev, year: e.target.value }))}
              />
            </FormField>
            <FormField label="Color">
              <Input
                placeholder="e.g., Black"
                value={newVehicle.color}
                onChange={(e) => setNewVehicle((prev) => ({ ...prev, color: e.target.value }))}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Make" required>
              <Input
                placeholder="e.g., Toyota"
                value={newVehicle.make}
                onChange={(e) => setNewVehicle((prev) => ({ ...prev, make: e.target.value }))}
              />
            </FormField>
            <FormField label="Model" required>
              <Input
                placeholder="e.g., Camry"
                value={newVehicle.model}
                onChange={(e) => setNewVehicle((prev) => ({ ...prev, model: e.target.value }))}
              />
            </FormField>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowAddVehicle(false)} disabled={addingVehicle}>
            Cancel
          </Button>
          <Button
            onClick={handleAddVehicle}
            disabled={addingVehicle || (!newVehicle.make && !newVehicle.model)}
          >
            {addingVehicle ? <Spinner size="sm" /> : <Plus className="h-4 w-4" />}
            Add Vehicle
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" />
              Add Item
            </Button>
          </div>
          {errors.items && <p className="text-xs text-red-600">{errors.items}</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => (
            <div key={item.key} className="rounded-md border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">Item {index + 1}</span>
                {items.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeItem(item.key)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <FormField label="Service" className="sm:col-span-2 lg:col-span-3">
                  <Select
                    value={item.service_id || ''}
                    onChange={(e) => handleServiceSelect(item.key, e.target.value)}
                  >
                    <option value="">Custom item...</option>
                    {services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField label="Item Name" required error={errors[`item_${index}_name`]} className="sm:col-span-2 lg:col-span-3">
                  <Input
                    value={item.item_name}
                    onChange={(e) => updateItem(item.key, 'item_name', e.target.value)}
                    placeholder="Service or product name"
                    readOnly={!!item.service_id}
                  />
                </FormField>

                {/* Tier picker — shown when service has pricing tiers */}
                {(() => {
                  const svc = item.service_id ? services.find((s) => s.id === item.service_id) as (Service & { pricing?: ServicePricing[] }) | undefined : null;
                  const tiers = svc ? getServicePriceTiers(svc) : [];
                  const selectedTier = tiers.find((t) => t.tier_name === item.tier_name);
                  const showSizeClass = selectedTier?.is_vehicle_size_aware;

                  if (tiers.length === 0) return null;

                  return (
                    <>
                      <FormField label="Pricing Tier" className="sm:col-span-2 lg:col-span-3">
                        <Select
                          value={item.tier_name || ''}
                          onChange={(e) => handleTierSelect(item.key, e.target.value)}
                        >
                          {tiers.map((tier) => (
                            <option key={tier.tier_name} value={tier.tier_name}>
                              {tier.tier_label || tier.tier_name} — {formatCurrency(tier.price)}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      {showSizeClass && (
                        <FormField label="Vehicle Size" className="lg:col-span-2">
                          <Select
                            value={selectedVehicleSizeClass || ''}
                            onChange={(e) => handleItemSizeClassChange(item.key, e.target.value)}
                          >
                            <option value="">Select size...</option>
                            <option value="sedan">{VEHICLE_SIZE_LABELS['sedan']}</option>
                            <option value="truck_suv_2row">{VEHICLE_SIZE_LABELS['truck_suv_2row']}</option>
                            <option value="suv_3row_van">{VEHICLE_SIZE_LABELS['suv_3row_van']}</option>
                          </Select>
                        </FormField>
                      )}
                    </>
                  );
                })()}

                <FormField label="Qty" className="lg:col-span-1">
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(item.key, 'quantity', parseInt(e.target.value) || 1)}
                  />
                </FormField>

                <FormField label="Unit Price" error={errors[`item_${index}_price`]} className="lg:col-span-1">
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unit_price || ''}
                    onChange={(e) => updateItem(item.key, 'unit_price', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    readOnly={!!item.service_id}
                  />
                </FormField>

                <FormField label="Total" className="lg:col-span-1">
                  <div className="flex h-9 items-center text-sm font-medium text-gray-900">
                    {formatCurrency(item.quantity * item.unit_price)}
                  </div>
                </FormField>
              </div>

              <div className="mt-3">
                <FormField label="Notes">
                  <Input
                    value={item.notes || ''}
                    onChange={(e) => updateItem(item.key, 'notes', e.target.value || null)}
                    placeholder="Optional notes..."
                  />
                </FormField>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Details & Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Valid Until">
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </FormField>
            <FormField label="Notes">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes..."
                rows={4}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium text-gray-900">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Tax (10.25%)</span>
                <span className="font-medium text-gray-900">{formatCurrency(taxAmount)}</span>
              </div>
              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-gray-900">Total</span>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-6">
        <Button variant="outline" onClick={() => router.push('/admin/quotes')} disabled={saving}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
          Save Changes
        </Button>
        <Button onClick={() => setShowSendDialog(true)} disabled={saving}>
          <Send className="h-4 w-4" />
          Send Estimate
        </Button>
      </div>

      {/* Send Estimate Dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogHeader>
          <DialogTitle>Send Estimate</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <p className="text-sm text-gray-600">
            How would you like to send this estimate to{' '}
            <span className="font-medium">{quote.customer?.first_name} {quote.customer?.last_name}</span>?
          </p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="sendMethod"
                value="email"
                checked={sendMethod === 'email'}
                onChange={() => setSendMethod('email')}
              />
              <Mail className="h-5 w-5 text-gray-500" />
              <div>
                <div className="text-sm font-medium">Email</div>
                <div className="text-xs text-gray-500">
                  {quote.customer?.email || 'No email on file'}
                </div>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="sendMethod"
                value="sms"
                checked={sendMethod === 'sms'}
                onChange={() => setSendMethod('sms')}
              />
              <MessageSquare className="h-5 w-5 text-gray-500" />
              <div>
                <div className="text-sm font-medium">SMS (with PDF)</div>
                <div className="text-xs text-gray-500">
                  {quote.customer?.phone || 'No phone on file'}
                </div>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="sendMethod"
                value="both"
                checked={sendMethod === 'both'}
                onChange={() => setSendMethod('both')}
              />
              <Send className="h-5 w-5 text-gray-500" />
              <div>
                <div className="text-sm font-medium">Both Email & SMS</div>
                <div className="text-xs text-gray-500">Send via all available channels</div>
              </div>
            </label>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowSendDialog(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
