'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { Coupon, Service } from '@/lib/supabase/types';
import { VARIABLE_GROUPS, CAMPAIGN_GROUPS, renderTemplate } from '@/lib/utils/template';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, ArrowRight, Users, Send, Plus, Eye, ChevronLeft, ChevronRight, Clock, FlaskConical } from 'lucide-react';
import { SITE_URL, FEATURE_FLAGS } from '@/lib/utils/constants';
import { useBusinessInfo } from '@/lib/hooks/use-business-info';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';

type Step = 'basics' | 'audience' | 'message' | 'coupon' | 'review';

const STEPS: { key: Step; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'audience', label: 'Audience' },
  { key: 'message', label: 'Message' },
  { key: 'coupon', label: 'Coupon' },
  { key: 'review', label: 'Review & Send' },
];

export interface CampaignVariant {
  label: string;
  messageBody: string;
  emailSubject: string;
  splitPercentage: number;
}

export interface InitialCampaignData {
  id: string;
  name: string;
  channel: 'sms' | 'email' | 'both';
  audience_filters: Record<string, unknown>;
  sms_template: string | null;
  email_subject: string | null;
  email_template: string | null;
  coupon_id: string | null;
  scheduled_at: string | null;
  // A/B testing fields
  variants?: CampaignVariant[] | null;
  auto_select_winner?: boolean;
  auto_select_after_hours?: number | null;
}

interface CampaignWizardProps {
  initialData?: InitialCampaignData;
}

function toLocalDatetime(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Build a human-readable discount summary from coupon rewards */
function couponRewardsSummary(coupon: Coupon): string {
  const rewards = (coupon as any).coupon_rewards || [];
  if (rewards.length === 0) return 'No rewards';
  return rewards.map((r: any) => {
    if (r.discount_type === 'free') return 'Free';
    if (r.discount_type === 'percentage') return `${r.discount_value}% off`;
    return `$${r.discount_value} off`;
  }).join(' + ');
}

function formatPhoneForPreview(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return phone;
}

export function CampaignWizard({ initialData }: CampaignWizardProps) {
  const router = useRouter();
  const supabase = createClient();
  const { info: businessInfo } = useBusinessInfo();
  const { enabled: smsMarketingEnabled } = useFeatureFlag(FEATURE_FLAGS.SMS_MARKETING);
  const { enabled: emailMarketingEnabled } = useFeatureFlag(FEATURE_FLAGS.EMAIL_MARKETING);

  const [campaignId, setCampaignId] = useState<string | null>(initialData?.id ?? null);
  const [step, setStep] = useState<Step>('basics');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<{id: string; name: string}[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [totalMatch, setTotalMatch] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Form state
  const initFilters = initialData?.audience_filters ?? {};
  const [name, setName] = useState(initialData?.name ?? '');
  const [channel, setChannel] = useState<'sms' | 'email' | 'both'>(initialData?.channel ?? 'sms');
  const [smsTemplate, setSmsTemplate] = useState(initialData?.sms_template ?? '');
  const [emailSubject, setEmailSubject] = useState(initialData?.email_subject ?? '');
  const [emailTemplate, setEmailTemplate] = useState(initialData?.email_template ?? '');
  const [couponId, setCouponId] = useState(initialData?.coupon_id ?? '');
  const [scheduledAt, setScheduledAt] = useState(
    initialData?.scheduled_at ? toLocalDatetime(initialData.scheduled_at) : ''
  );

  // A/B testing state
  const hasInitialAB = initialData?.variants && initialData.variants.length === 2;
  const [abTestEnabled, setAbTestEnabled] = useState(!!hasInitialAB);
  const [variantBSmsTemplate, setVariantBSmsTemplate] = useState(
    hasInitialAB ? initialData!.variants![1].messageBody : ''
  );
  const [variantBEmailSubject, setVariantBEmailSubject] = useState(
    hasInitialAB ? initialData!.variants![1].emailSubject : ''
  );
  const [variantBEmailTemplate, setVariantBEmailTemplate] = useState('');
  const [splitPercentage, setSplitPercentage] = useState(
    hasInitialAB ? initialData!.variants![0].splitPercentage : 50
  );
  const [autoSelectWinner, setAutoSelectWinner] = useState(
    initialData?.auto_select_winner ?? false
  );
  const [autoSelectAfterHours, setAutoSelectAfterHours] = useState(
    initialData?.auto_select_after_hours ?? 48
  );

  const SPLIT_OPTIONS = [50, 60, 70, 80] as const;

  // Audience filters
  const [customerType, setCustomerType] = useState(String(initFilters.customer_type ?? ''));
  const [lastService, setLastService] = useState(String(initFilters.last_service ?? ''));
  const [daysSinceVisitMin, setDaysSinceVisitMin] = useState(
    initFilters.days_since_visit_min != null ? String(initFilters.days_since_visit_min) : ''
  );
  const [daysSinceVisitMax, setDaysSinceVisitMax] = useState(
    initFilters.days_since_visit_max != null ? String(initFilters.days_since_visit_max) : ''
  );
  const [vehicleType, setVehicleType] = useState(String(initFilters.vehicle_type ?? ''));
  const [minSpend, setMinSpend] = useState(
    initFilters.min_spend != null ? String(initFilters.min_spend) : ''
  );

  // Message preview dialog state
  interface PreviewCustomer {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  }
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewCustomers, setPreviewCustomers] = useState<PreviewCustomer[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [loadingPreviewSample, setLoadingPreviewSample] = useState(false);

  // Coupon dialog state
  const [couponDialogOpen, setCouponDialogOpen] = useState(false);
  const [couponSaving, setCouponSaving] = useState(false);
  const [newCouponName, setNewCouponName] = useState('');
  const [newCouponAutoGen, setNewCouponAutoGen] = useState(true);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponAppliesTo, setNewCouponAppliesTo] = useState<string>('order');
  const [newCouponTargetProductId, setNewCouponTargetProductId] = useState('');
  const [newCouponTargetServiceId, setNewCouponTargetServiceId] = useState('');
  const [newCouponDiscountType, setNewCouponDiscountType] = useState<string>('percentage');
  const [newCouponDiscountValue, setNewCouponDiscountValue] = useState('');
  const [newCouponMaxDiscount, setNewCouponMaxDiscount] = useState('');
  const [newCouponMaxUses, setNewCouponMaxUses] = useState('');
  const [newCouponExpiresAt, setNewCouponExpiresAt] = useState('');
  const [newCouponSingleUse, setNewCouponSingleUse] = useState(true);

  useEffect(() => {
    async function load() {
      const [servicesRes, couponsRes, productsRes] = await Promise.all([
        supabase.from('services').select('id, name').eq('is_active', true).order('name'),
        supabase.from('coupons').select('*, coupon_rewards(*)').eq('status', 'active').order('code'),
        supabase.from('products').select('id, name').eq('is_active', true).order('name'),
      ]);
      if (servicesRes.data) setServices(servicesRes.data as Service[]);
      if (couponsRes.data) {
        const now = new Date();
        setCoupons(couponsRes.data.filter((c: Coupon) => !c.expires_at || new Date(c.expires_at) >= now));
      }
      if (productsRes.data) setProducts(productsRes.data);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const buildFilters = useCallback(() => {
    const filters: Record<string, unknown> = {};
    if (customerType) filters.customer_type = customerType;
    if (lastService) filters.last_service = lastService;
    const parsedMin = daysSinceVisitMin ? parseInt(daysSinceVisitMin) : NaN;
    if (parsedMin > 0) filters.days_since_visit_min = parsedMin;
    const parsedMax = daysSinceVisitMax ? parseInt(daysSinceVisitMax) : NaN;
    if (parsedMax > 0) filters.days_since_visit_max = parsedMax;
    if (vehicleType) filters.vehicle_type = vehicleType;
    const parsedSpend = minSpend ? parseFloat(minSpend) : NaN;
    if (parsedSpend > 0) filters.min_spend = parsedSpend;
    return filters;
  }, [customerType, lastService, daysSinceVisitMin, daysSinceVisitMax, vehicleType, minSpend]);

  function buildPayload() {
    const base: Record<string, unknown> = {
      name,
      channel,
      audience_filters: buildFilters(),
      sms_template: smsTemplate || null,
      email_subject: emailSubject || null,
      email_template: emailTemplate || null,
      coupon_id: couponId || null,
      scheduled_at: scheduledAt || null,
    };

    if (abTestEnabled) {
      base.variants = [
        {
          label: 'A',
          messageBody: (channel === 'sms' || channel === 'both') ? smsTemplate : emailTemplate,
          emailSubject: (channel === 'email' || channel === 'both') ? emailSubject : '',
          splitPercentage,
        },
        {
          label: 'B',
          messageBody: (channel === 'sms' || channel === 'both') ? variantBSmsTemplate : variantBEmailTemplate,
          emailSubject: (channel === 'email' || channel === 'both') ? variantBEmailSubject : '',
          splitPercentage: 100 - splitPercentage,
        },
      ];
      base.auto_select_winner = autoSelectWinner;
      base.auto_select_after_hours = autoSelectWinner ? autoSelectAfterHours : null;
    } else {
      base.variants = null;
      base.auto_select_winner = false;
      base.auto_select_after_hours = null;
    }

    return base;
  }

  // -- Silent auto-save (called on step navigation) --
  async function silentSave() {
    if (!name.trim()) return; // Can't save without a name
    try {
      if (campaignId) {
        await fetch(`/api/marketing/campaigns/${campaignId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        });
      } else {
        const res = await fetch('/api/marketing/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        });
        if (res.ok) {
          const result = await res.json();
          setCampaignId(result.data.id);
          window.history.replaceState(
            null,
            '',
            `/admin/marketing/campaigns/${result.data.id}/edit`
          );
        }
      }
    } catch {
      // Silent -- don't interrupt the user for background saves
    }
  }

  async function navigateToStep(targetStep: Step) {
    await silentSave();
    setStep(targetStep);
  }

  // -- Explicit saves --
  async function handleSave(): Promise<{ id: string } | null> {
    if (!name.trim()) {
      toast.error('Campaign name is required');
      return null;
    }

    // A/B test validation
    if (abTestEnabled) {
      const needsSms = channel === 'sms' || channel === 'both';
      const needsEmail = channel === 'email' || channel === 'both';

      if (needsSms && !smsTemplate.trim()) {
        toast.error('Variant A SMS message is required');
        return null;
      }
      if (needsSms && !variantBSmsTemplate.trim()) {
        toast.error('Variant B SMS message is required');
        return null;
      }
      if (needsEmail && !emailTemplate.trim()) {
        toast.error('Variant A email body is required');
        return null;
      }
      if (needsEmail && !variantBEmailTemplate.trim()) {
        toast.error('Variant B email body is required');
        return null;
      }
    }

    setSaving(true);
    try {
      if (campaignId) {
        const res = await fetch(`/api/marketing/campaigns/${campaignId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        });
        const result = await res.json();
        if (!res.ok) {
          toast.error(result.error || 'Failed to update campaign');
          return null;
        }
        return result.data;
      } else {
        const res = await fetch('/api/marketing/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        });
        const result = await res.json();
        if (!res.ok) {
          toast.error(result.error || 'Failed to create campaign');
          return null;
        }
        setCampaignId(result.data.id);
        return result.data;
      }
    } catch {
      toast.error('Failed to save campaign');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    const campaign = await handleSave();
    if (campaign) {
      toast.success('Campaign saved as draft');
      router.push('/admin/marketing/campaigns');
    }
  }

  async function handleSendNow() {
    setSending(true);
    try {
      const campaign = await handleSave();
      if (!campaign) {
        setSending(false);
        return;
      }

      const sendRes = await fetch(`/api/marketing/campaigns/${campaign.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (sendRes.ok) {
        const { data } = await sendRes.json();
        toast.success(
          `Campaign sent to ${data.recipient_count} recipients (${data.delivered_count} delivered)`
        );
        router.push(`/admin/marketing/campaigns/${campaign.id}`);
      } else {
        const { error } = await sendRes.json();
        toast.error(error || 'Failed to send');
        router.push(`/admin/marketing/campaigns/${campaign.id}`);
      }
    } catch {
      toast.error('Failed to send campaign');
    } finally {
      setSending(false);
    }
  }

  async function handleSchedule() {
    if (!scheduledAt) {
      toast.error('Please select a schedule date/time');
      return;
    }
    setSending(true);
    try {
      const campaign = await handleSave();
      if (!campaign) {
        setSending(false);
        return;
      }

      const sendRes = await fetch(`/api/marketing/campaigns/${campaign.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_at: scheduledAt }),
      });

      if (sendRes.ok) {
        toast.success('Campaign scheduled');
        router.push(`/admin/marketing/campaigns/${campaign.id}`);
      }
    } catch {
      toast.error('Failed to schedule campaign');
    } finally {
      setSending(false);
    }
  }

  // -- Audience preview --
  async function previewAudience() {
    setLoadingPreview(true);
    try {
      const res = await fetch('/api/marketing/campaigns/audience-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: buildFilters(), channel }),
      });
      const json = await res.json();
      if (res.ok) {
        setAudienceCount(json.data.consentEligible);
        setTotalMatch(json.data.totalMatch);
      } else {
        toast.error(json.error || 'Failed to preview audience');
      }
    } catch {
      toast.error('Failed to preview audience');
    }
    setLoadingPreview(false);
  }

  // -- Message preview with real data --
  async function openMessagePreview() {
    setLoadingPreviewSample(true);
    setPreviewDialogOpen(true);
    setPreviewIndex(0);
    try {
      const res = await fetch('/api/marketing/campaigns/audience-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: buildFilters(), channel, limit: 50 }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setPreviewCustomers(data);
      }
    } catch {
      toast.error('Failed to load audience sample');
    }
    setLoadingPreviewSample(false);
  }

  function renderPreviewForCustomer(customer: PreviewCustomer) {
    // Only generate a sample coupon code if a coupon is actually attached
    let sampleCode = '';
    if (couponId) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let i = 0; i < 8; i++) {
        sampleCode += chars[Math.floor(Math.random() * chars.length)];
      }
    }

    const previewBookParams = new URLSearchParams();
    const previewFullName = `${customer.first_name} ${customer.last_name}`.trim();
    if (previewFullName) previewBookParams.set('name', previewFullName);
    if (customer.phone) previewBookParams.set('phone', customer.phone);
    if (customer.email) previewBookParams.set('email', customer.email);
    if (sampleCode) previewBookParams.set('coupon', sampleCode);
    const previewBookUrl = `${SITE_URL}/book${previewBookParams.toString() ? '?' + previewBookParams.toString() : ''}`;

    const vars: Record<string, string> = {
      first_name: customer.first_name,
      last_name: customer.last_name,
      coupon_code: sampleCode,
      business_name: businessInfo?.name || '',
      business_phone: businessInfo?.phone ? formatPhoneForPreview(businessInfo.phone) : '(310) 756-4789',
      business_address: businessInfo?.address || '123 Main St, Lomita, CA',
      booking_url: `${SITE_URL}/book`,
      book_url: previewBookUrl,
      offer_url: sampleCode
        ? `${SITE_URL}/book?coupon=${sampleCode}&email=${encodeURIComponent(customer.email || '')}`
        : `${SITE_URL}/book`,
      book_now_url: sampleCode
        ? `${SITE_URL}/book?coupon=${sampleCode}&email=${encodeURIComponent(customer.email || '')}`
        : `${SITE_URL}/book`, // backward compat
      service_name: '',
      google_review_link: 'https://g.page/r/review',
      yelp_review_link: 'https://yelp.com/review',
      loyalty_points: '1,250',
      loyalty_value: '$12.50',
      visit_count: '8',
      days_since_last_visit: '45',
      lifetime_spend: '$1,850',
    };

    const variantA = {
      sms: smsTemplate ? renderTemplate(smsTemplate, vars) : null,
      subject: emailSubject ? renderTemplate(emailSubject, vars) : null,
      email: emailTemplate ? renderTemplate(emailTemplate, vars) : null,
    };

    const variantB = abTestEnabled ? {
      sms: variantBSmsTemplate ? renderTemplate(variantBSmsTemplate, vars) : null,
      subject: variantBEmailSubject ? renderTemplate(variantBEmailSubject, vars) : null,
      email: variantBEmailTemplate ? renderTemplate(variantBEmailTemplate, vars) : null,
    } : null;

    return { variantA, variantB, couponCode: sampleCode };
  }

  // -- Template variable helpers --
  function insertVariable(
    setter: (fn: (prev: string) => string) => void,
    variable: string,
    inputId: string
  ) {
    const el = document.getElementById(inputId) as HTMLInputElement | HTMLTextAreaElement | null;
    const tag = `{${variable}}`;
    if (el && el.selectionStart != null) {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      setter((prev: string) => prev.slice(0, start) + tag + prev.slice(end));
      // Restore cursor position after the inserted variable
      requestAnimationFrame(() => {
        el.focus();
        const newPos = start + tag.length;
        el.setSelectionRange(newPos, newPos);
      });
    } else {
      setter((prev: string) => `${prev}${tag}`);
    }
  }

  const variableChips = (setter: (fn: (prev: string) => string) => void, inputId: string) => (
    <div className="mt-2 space-y-1.5">
      {CAMPAIGN_GROUPS.map((groupName) => (
        <div key={groupName} className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">{groupName}</span>
          {Object.entries(VARIABLE_GROUPS[groupName]).map(([key, desc]) => (
            <button
              key={key}
              type="button"
              onClick={() => insertVariable(setter, key, inputId)}
              className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
              title={desc}
            >
              {`{${key}}`}
            </button>
          ))}
        </div>
      ))}
    </div>
  );

  // -- Inline coupon creation --
  function resetCouponForm() {
    setNewCouponName('');
    setNewCouponAutoGen(true);
    setNewCouponCode('');
    setNewCouponAppliesTo('order');
    setNewCouponTargetProductId('');
    setNewCouponTargetServiceId('');
    setNewCouponDiscountType('percentage');
    setNewCouponDiscountValue('');
    setNewCouponMaxDiscount('');
    setNewCouponMaxUses('');
    setNewCouponExpiresAt('');
    setNewCouponSingleUse(true);
  }

  async function handleCreateCoupon() {
    if (newCouponDiscountType !== 'free' && !newCouponDiscountValue) {
      toast.error('Discount value is required');
      return;
    }
    setCouponSaving(true);
    try {
      const res = await fetch('/api/marketing/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCouponName || null,
          code: newCouponAutoGen ? '' : newCouponCode,
          auto_apply: false,
          is_single_use: newCouponSingleUse,
          expires_at: newCouponExpiresAt || null,
          max_uses: newCouponMaxUses ? parseInt(newCouponMaxUses) : null,
          rewards: [{
            applies_to: newCouponAppliesTo,
            discount_type: newCouponDiscountType,
            discount_value: newCouponDiscountType === 'free' ? 0 : parseFloat(newCouponDiscountValue || '0'),
            max_discount: newCouponMaxDiscount ? parseFloat(newCouponMaxDiscount) : null,
            target_product_id: newCouponAppliesTo === 'product' ? newCouponTargetProductId || null : null,
            target_service_id: newCouponAppliesTo === 'service' ? newCouponTargetServiceId || null : null,
          }],
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || 'Failed to create coupon');
        return;
      }

      // Add to local list and auto-select
      setCoupons((prev) => [...prev, result.data]);
      setCouponId(result.data.id);
      setCouponDialogOpen(false);
      toast.success(`Coupon ${result.data.code} created`);
      resetCouponForm();
    } catch {
      toast.error('Failed to create coupon');
    } finally {
      setCouponSaving(false);
    }
  }

  // -- Navigation state --
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const canNext = stepIndex < STEPS.length - 1;
  const canPrev = stepIndex > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={initialData ? 'Edit Campaign' : 'Create Campaign'}
        action={
          <Button
            variant="outline"
            onClick={() => router.push('/admin/marketing/campaigns')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-gray-300" />}
            <button
              onClick={() => navigateToStep(s.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                step === s.key
                  ? 'bg-gray-900 text-white'
                  : i < stepIndex
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {s.label}
            </button>
          </div>
        ))}
      </div>

      {/* Step 1: Basics */}
      {step === 'basics' && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign Basics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <FormField label="Campaign Name" required htmlFor="name">
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Spring Special"
                />
              </FormField>
              <FormField label="Channel" required htmlFor="channel">
                <Select
                  id="channel"
                  value={channel}
                  onChange={(e) =>
                    setChannel(e.target.value as 'sms' | 'email' | 'both')
                  }
                >
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="both">SMS + Email</option>
                </Select>
              </FormField>
            </div>

            {/* Warning when selected channel(s) are disabled */}
            {((channel === 'sms' || channel === 'both') && !smsMarketingEnabled) && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                SMS Marketing is currently disabled. This campaign won&apos;t send SMS until it&apos;s enabled in Settings &rarr; Feature Toggles.
              </div>
            )}
            {((channel === 'email' || channel === 'both') && !emailMarketingEnabled) && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Email Marketing is currently disabled. This campaign won&apos;t send emails until it&apos;s enabled in Settings &rarr; Feature Toggles.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Audience */}
      {step === 'audience' && (
        <Card>
          <CardHeader>
            <CardTitle>Target Audience</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <FormField label="Customer Type" htmlFor="customer_type">
                <Select
                  id="customer_type"
                  value={customerType}
                  onChange={(e) => setCustomerType(e.target.value)}
                >
                  <option value="">Any</option>
                  <option value="enthusiast">Enthusiast</option>
                  <option value="professional">Professional</option>
                </Select>
              </FormField>
              <FormField label="Last Service" htmlFor="last_service">
                <Select
                  id="last_service"
                  value={lastService}
                  onChange={(e) => setLastService(e.target.value)}
                >
                  <option value="">Any service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Vehicle Type" htmlFor="vehicle_type">
                <Select
                  id="vehicle_type"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                >
                  <option value="">Any</option>
                  <option value="standard">Standard</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="rv">RV</option>
                  <option value="boat">Boat</option>
                  <option value="aircraft">Aircraft</option>
                </Select>
              </FormField>
              <FormField label="Days Since Last Visit (min)" htmlFor="days_min">
                <Input
                  id="days_min"
                  type="number"
                  min="0"
                  value={daysSinceVisitMin}
                  onChange={(e) => setDaysSinceVisitMin(e.target.value)}
                  placeholder="e.g. 30"
                />
              </FormField>
              <FormField label="Days Since Last Visit (max)" htmlFor="days_max">
                <Input
                  id="days_max"
                  type="number"
                  min="0"
                  value={daysSinceVisitMax}
                  onChange={(e) => setDaysSinceVisitMax(e.target.value)}
                  placeholder="e.g. 90"
                />
              </FormField>
              <FormField label="Minimum Lifetime Spend" htmlFor="min_spend">
                <Input
                  id="min_spend"
                  type="number"
                  step="0.01"
                  min="0"
                  value={minSpend}
                  onChange={(e) => setMinSpend(e.target.value)}
                  placeholder="e.g. 100"
                />
              </FormField>
            </div>
            <div className="mt-6 flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={previewAudience}
                disabled={loadingPreview}
              >
                <Users className="h-4 w-4" />
                {loadingPreview ? 'Counting...' : 'Preview Audience'}
              </Button>
              {totalMatch !== null && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">
                      {totalMatch} matching customers
                    </Badge>
                    <Badge
                      variant={
                        audienceCount && audienceCount > 0
                          ? 'success'
                          : 'warning'
                      }
                    >
                      {audienceCount} with{' '}
                      {channel === 'both'
                        ? 'SMS or email'
                        : channel.toUpperCase()}{' '}
                      consent
                    </Badge>
                  </div>
                  {totalMatch > 0 && audienceCount === 0 && (
                    <p className="text-xs text-amber-600">
                      Customers match your filters but none have opted in to{' '}
                      {channel === 'both'
                        ? 'SMS or email'
                        : channel.toUpperCase()}{' '}
                      marketing. Update customer consent settings or use a
                      different channel.
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Message */}
      {step === 'message' && (
        <Card>
          <CardHeader>
            <CardTitle>Message Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Variant A label when A/B testing */}
              {abTestEnabled && (
                <div className="flex items-center gap-2">
                  <Badge variant="info">Variant A</Badge>
                  <span className="text-sm text-gray-500">({splitPercentage}% of recipients)</span>
                </div>
              )}

              {(channel === 'sms' || channel === 'both') && (
                <div>
                  <FormField label="SMS Message" htmlFor="sms_template">
                    <Textarea
                      id="sms_template"
                      value={smsTemplate}
                      onChange={(e) => setSmsTemplate(e.target.value)}
                      rows={4}
                      placeholder="Hi {first_name}, we have a special offer for you..."
                    />
                  </FormField>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {smsTemplate.length}/160 chars
                    </span>
                    <span className="text-xs text-gray-400">
                      {smsTemplate.length > 160
                        ? `${Math.ceil(smsTemplate.length / 153)} segments`
                        : '1 segment'}
                    </span>
                  </div>
                  {variableChips(setSmsTemplate, 'sms_template')}
                </div>
              )}
              {(channel === 'email' || channel === 'both') && (
                <>
                  <div>
                    <FormField label="Email Subject" htmlFor="email_subject">
                      <Input
                        id="email_subject"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder="Special offer just for you, {first_name}!"
                      />
                    </FormField>
                    {variableChips(setEmailSubject, 'email_subject')}
                  </div>
                  <div>
                    <FormField label="Email Body" htmlFor="email_template">
                      <Textarea
                        id="email_template"
                        value={emailTemplate}
                        onChange={(e) => setEmailTemplate(e.target.value)}
                        rows={8}
                        placeholder="Hi {first_name},&#10;&#10;We wanted to reach out with a special offer..."
                      />
                    </FormField>
                    {variableChips(setEmailTemplate, 'email_template')}
                  </div>
                </>
              )}

              {/* A/B Testing Toggle */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Enable A/B Testing
                      </p>
                      <p className="mt-0.5 text-sm text-gray-500">
                        Test two message variants to find what performs best.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={abTestEnabled}
                    onCheckedChange={setAbTestEnabled}
                  />
                </div>

                {/* A/B Test Fields */}
                {abTestEnabled && (
                  <div className="mt-6 space-y-6">
                    {/* Variant B */}
                    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <Badge variant="warning">Variant B</Badge>
                        <span className="text-sm text-gray-500">({100 - splitPercentage}% of recipients)</span>
                      </div>

                      {(channel === 'sms' || channel === 'both') && (
                        <div>
                          <FormField label="SMS Message (Variant B)" htmlFor="variant_b_sms">
                            <Textarea
                              id="variant_b_sms"
                              value={variantBSmsTemplate}
                              onChange={(e) => setVariantBSmsTemplate(e.target.value)}
                              rows={4}
                              placeholder="Hi {first_name}, don't miss our exclusive deal..."
                            />
                          </FormField>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-xs text-gray-400">
                              {variantBSmsTemplate.length}/160 chars
                            </span>
                            <span className="text-xs text-gray-400">
                              {variantBSmsTemplate.length > 160
                                ? `${Math.ceil(variantBSmsTemplate.length / 153)} segments`
                                : '1 segment'}
                            </span>
                          </div>
                          {variableChips(setVariantBSmsTemplate, 'variant_b_sms')}
                        </div>
                      )}

                      {(channel === 'email' || channel === 'both') && (
                        <>
                          <div className={channel === 'both' ? 'mt-4' : ''}>
                            <FormField label="Email Subject (Variant B)" htmlFor="variant_b_email_subject">
                              <Input
                                id="variant_b_email_subject"
                                value={variantBEmailSubject}
                                onChange={(e) => setVariantBEmailSubject(e.target.value)}
                                placeholder="A special surprise for you, {first_name}!"
                              />
                            </FormField>
                            {variableChips(setVariantBEmailSubject, 'variant_b_email_subject')}
                          </div>
                          <div className="mt-4">
                            <FormField label="Email Body (Variant B)" htmlFor="variant_b_email_template">
                              <Textarea
                                id="variant_b_email_template"
                                value={variantBEmailTemplate}
                                onChange={(e) => setVariantBEmailTemplate(e.target.value)}
                                rows={8}
                                placeholder="Hi {first_name},&#10;&#10;We have something exciting to share..."
                              />
                            </FormField>
                            {variableChips(setVariantBEmailTemplate, 'variant_b_email_template')}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Split Percentage */}
                    <div>
                      <p className="mb-2 text-sm font-medium text-gray-700">
                        Traffic Split
                      </p>
                      <div className="flex items-center gap-3">
                        {SPLIT_OPTIONS.map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setSplitPercentage(pct)}
                            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                              splitPercentage === pct
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {pct}/{100 - pct}
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 flex overflow-hidden rounded-full">
                        <div
                          className="flex h-2.5 items-center justify-center bg-blue-500 transition-all duration-300"
                          style={{ width: `${splitPercentage}%` }}
                        />
                        <div
                          className="flex h-2.5 items-center justify-center bg-yellow-500 transition-all duration-300"
                          style={{ width: `${100 - splitPercentage}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-gray-500">
                        <span>Variant A: {splitPercentage}%</span>
                        <span>Variant B: {100 - splitPercentage}%</span>
                      </div>
                    </div>

                    {/* Auto-select Winner */}
                    <div className="rounded-md border border-gray-200 bg-white p-4">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="auto_select_winner"
                          checked={autoSelectWinner}
                          onChange={() => setAutoSelectWinner(!autoSelectWinner)}
                        />
                        <label
                          htmlFor="auto_select_winner"
                          className="text-sm font-medium text-gray-700"
                        >
                          Auto-select winner after
                        </label>
                        {autoSelectWinner && (
                          <Select
                            value={String(autoSelectAfterHours)}
                            onChange={(e) => setAutoSelectAfterHours(parseInt(e.target.value))}
                            className="w-32"
                          >
                            <option value="24">24 hours</option>
                            <option value="48">48 hours</option>
                            <option value="72">72 hours</option>
                            <option value="168">1 week</option>
                          </Select>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        Recipients will be randomly split between variants. The variant with the higher click rate wins.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Coupon */}
      {step === 'coupon' && (
        <Card>
          <CardHeader>
            <CardTitle>Attach Coupon (Optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              label="Select Coupon"
              htmlFor="coupon_id"
              description="Each recipient will receive a unique coupon code based on this template"
            >
              <Select
                id="coupon_id"
                value={couponId}
                onChange={(e) => setCouponId(e.target.value)}
              >
                <option value="">No coupon</option>
                {coupons.map((c) => {
                  const rewards = (c as any).coupon_rewards || [];
                  const summary = rewards.map((r: any) => {
                    if (r.discount_type === 'free') return 'Free';
                    if (r.discount_type === 'percentage') return `${r.discount_value}% off`;
                    return `$${r.discount_value} off`;
                  }).join(' + ') || 'No rewards';
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name ? `${c.name} (${c.code})` : c.code} — {summary}
                    </option>
                  );
                })}
              </Select>
            </FormField>
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCouponDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Create New Coupon
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Review */}
      {step === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Send</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium">{name || '--'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Channel</p>
                  <Badge variant="info">{channel.toUpperCase()}</Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Audience</p>
                  <p className="font-medium">
                    {totalMatch !== null
                      ? `${totalMatch} match filters, ${audienceCount} with consent`
                      : 'Not previewed'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Coupon</p>
                  <p className="font-medium">
                    {couponId
                      ? (() => {
                          const c = coupons.find((c) => c.id === couponId);
                          if (!c) return 'Selected';
                          const summary = couponRewardsSummary(c);
                          return `${c.code} — ${summary}`;
                        })()
                      : 'None'}
                  </p>
                </div>
              </div>

              {/* A/B Test info */}
              {abTestEnabled && (
                <div>
                  <p className="text-sm text-gray-500">A/B Testing</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="info">Enabled</Badge>
                    <span className="text-sm text-gray-600">
                      {splitPercentage}/{100 - splitPercentage} split
                    </span>
                    {autoSelectWinner && (
                      <Badge variant="default">
                        Auto-select winner after {autoSelectAfterHours}h
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Message templates — show variants when A/B enabled */}
              {abTestEnabled ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Variant A */}
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="info">Variant A</Badge>
                      <span className="text-xs text-gray-500">{splitPercentage}%</span>
                    </div>
                    {(channel === 'sms' || channel === 'both') && smsTemplate && (
                      <div className="mb-2">
                        <p className="mb-0.5 text-xs font-medium text-gray-500">SMS</p>
                        <p className="whitespace-pre-wrap text-sm">{smsTemplate}</p>
                      </div>
                    )}
                    {(channel === 'email' || channel === 'both') && emailTemplate && (
                      <div>
                        <p className="mb-0.5 text-xs font-medium text-gray-500">Email</p>
                        {emailSubject && (
                          <p className="text-sm font-medium">{emailSubject}</p>
                        )}
                        <p className="whitespace-pre-wrap text-sm">{emailTemplate}</p>
                      </div>
                    )}
                  </div>

                  {/* Variant B */}
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="warning">Variant B</Badge>
                      <span className="text-xs text-gray-500">{100 - splitPercentage}%</span>
                    </div>
                    {(channel === 'sms' || channel === 'both') && variantBSmsTemplate && (
                      <div className="mb-2">
                        <p className="mb-0.5 text-xs font-medium text-gray-500">SMS</p>
                        <p className="whitespace-pre-wrap text-sm">{variantBSmsTemplate}</p>
                      </div>
                    )}
                    {(channel === 'email' || channel === 'both') && (variantBEmailTemplate || variantBEmailSubject) && (
                      <div>
                        <p className="mb-0.5 text-xs font-medium text-gray-500">Email</p>
                        {variantBEmailSubject && (
                          <p className="text-sm font-medium">{variantBEmailSubject}</p>
                        )}
                        {variantBEmailTemplate && (
                          <p className="whitespace-pre-wrap text-sm">{variantBEmailTemplate}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {(channel === 'sms' || channel === 'both') && smsTemplate && (
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                      <p className="mb-1 text-xs font-medium text-gray-500">
                        SMS Template
                      </p>
                      <p className="whitespace-pre-wrap text-sm">{smsTemplate}</p>
                    </div>
                  )}

                  {(channel === 'email' || channel === 'both') && emailTemplate && (
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                      <p className="mb-1 text-xs font-medium text-gray-500">
                        Email Template
                      </p>
                      <p className="mb-1 text-sm font-medium">{emailSubject}</p>
                      <p className="whitespace-pre-wrap text-sm">
                        {emailTemplate}
                      </p>
                    </div>
                  )}
                </>
              )}

              {(smsTemplate || emailTemplate) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={openMessagePreview}
                >
                  <Eye className="h-4 w-4" />
                  Preview with Real Customer Data
                </Button>
              )}

              <div className="mt-4">
                <FormField
                  label="Schedule (optional)"
                  htmlFor="scheduled_at"
                  description="Leave empty to send immediately"
                >
                  <Input
                    id="scheduled_at"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </FormField>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              {scheduledAt ? (
                <Button
                  onClick={handleSchedule}
                  disabled={saving || sending}
                >
                  <Clock className="h-4 w-4" />
                  {sending ? 'Scheduling...' : 'Schedule Now'}
                </Button>
              ) : (
                <Button
                  onClick={handleSendNow}
                  disabled={saving || sending}
                >
                  <Send className="h-4 w-4" />
                  {sending ? 'Sending...' : 'Send Now'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => navigateToStep(STEPS[stepIndex - 1].key)}
          disabled={!canPrev}
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={saving || sending}
          >
            {saving ? 'Saving...' : 'Save & Exit'}
          </Button>
          {canNext && (
            <Button onClick={() => navigateToStep(STEPS[stepIndex + 1].key)}>
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* -- Create Coupon Dialog -- */}
      <Dialog open={couponDialogOpen} onOpenChange={setCouponDialogOpen}>
        <DialogClose onClose={() => setCouponDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>Create Coupon</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            <FormField label="Coupon Name" htmlFor="new_coupon_name">
              <Input
                id="new_coupon_name"
                value={newCouponName}
                onChange={(e) => setNewCouponName(e.target.value)}
                placeholder="e.g. Spring 20% Off"
              />
            </FormField>

            <div className="flex items-center gap-3">
              <Checkbox
                id="new_coupon_auto"
                checked={newCouponAutoGen}
                onChange={() => setNewCouponAutoGen(!newCouponAutoGen)}
              />
              <label
                htmlFor="new_coupon_auto"
                className="text-sm font-medium text-gray-700"
              >
                Auto-generate coupon code
              </label>
            </div>

            {!newCouponAutoGen && (
              <FormField label="Coupon Code" htmlFor="new_coupon_code">
                <Input
                  id="new_coupon_code"
                  value={newCouponCode}
                  onChange={(e) =>
                    setNewCouponCode(e.target.value.toUpperCase().replace(/\s/g, ''))
                  }
                  placeholder="e.g. SUMMER25"
                  className="font-mono uppercase"
                />
              </FormField>
            )}

            {/* Discount section */}
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="mb-3 text-xs font-medium uppercase text-gray-500">Discount</p>
              <div className="space-y-4">
                <FormField label="Applies To" required htmlFor="new_coupon_applies_to">
                  <Select
                    id="new_coupon_applies_to"
                    value={newCouponAppliesTo}
                    onChange={(e) => {
                      setNewCouponAppliesTo(e.target.value);
                      setNewCouponTargetProductId('');
                      setNewCouponTargetServiceId('');
                    }}
                  >
                    <option value="order">Entire Order</option>
                    <option value="product">Specific Product</option>
                    <option value="service">Specific Service</option>
                  </Select>
                </FormField>

                {newCouponAppliesTo === 'product' && (
                  <FormField label="Target Product" required htmlFor="new_coupon_target_product">
                    <Select
                      id="new_coupon_target_product"
                      value={newCouponTargetProductId}
                      onChange={(e) => setNewCouponTargetProductId(e.target.value)}
                    >
                      <option value="">Select product...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </Select>
                  </FormField>
                )}

                {newCouponAppliesTo === 'service' && (
                  <FormField label="Target Service" required htmlFor="new_coupon_target_service">
                    <Select
                      id="new_coupon_target_service"
                      value={newCouponTargetServiceId}
                      onChange={(e) => setNewCouponTargetServiceId(e.target.value)}
                    >
                      <option value="">Select service...</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </Select>
                  </FormField>
                )}

                <FormField label="Discount Type" required htmlFor="new_coupon_discount_type">
                  <Select
                    id="new_coupon_discount_type"
                    value={newCouponDiscountType}
                    onChange={(e) => {
                      setNewCouponDiscountType(e.target.value);
                      if (e.target.value === 'free') {
                        setNewCouponDiscountValue('');
                        setNewCouponMaxDiscount('');
                      }
                    }}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Dollar Amount ($)</option>
                    <option value="free">Free</option>
                  </Select>
                </FormField>

                {newCouponDiscountType !== 'free' && (
                  <FormField
                    label={newCouponDiscountType === 'percentage' ? 'Percentage Value' : 'Dollar Value'}
                    required
                    htmlFor="new_coupon_discount_value"
                  >
                    <Input
                      id="new_coupon_discount_value"
                      type="number"
                      step={newCouponDiscountType === 'percentage' ? '1' : '0.01'}
                      min="0"
                      max={newCouponDiscountType === 'percentage' ? '100' : undefined}
                      value={newCouponDiscountValue}
                      onChange={(e) => setNewCouponDiscountValue(e.target.value)}
                      placeholder={newCouponDiscountType === 'percentage' ? 'e.g. 20' : 'e.g. 10.00'}
                    />
                  </FormField>
                )}

                {newCouponDiscountType === 'percentage' && (
                  <FormField label="Max Discount ($)" htmlFor="new_coupon_max_disc">
                    <Input
                      id="new_coupon_max_disc"
                      type="number"
                      step="0.01"
                      min="0"
                      value={newCouponMaxDiscount}
                      onChange={(e) => setNewCouponMaxDiscount(e.target.value)}
                      placeholder="No cap"
                    />
                  </FormField>
                )}
              </div>
            </div>

            {/* Limits section */}
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="mb-3 text-xs font-medium uppercase text-gray-500">Limits</p>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Max Uses" htmlFor="new_coupon_max_uses">
                    <Input
                      id="new_coupon_max_uses"
                      type="number"
                      min="1"
                      value={newCouponMaxUses}
                      onChange={(e) => setNewCouponMaxUses(e.target.value)}
                      placeholder="Unlimited"
                    />
                  </FormField>
                  <FormField label="Expiry Date" htmlFor="new_coupon_expires">
                    <Input
                      id="new_coupon_expires"
                      type="datetime-local"
                      value={newCouponExpiresAt}
                      onChange={(e) => setNewCouponExpiresAt(e.target.value)}
                    />
                  </FormField>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="new_coupon_single"
                    checked={newCouponSingleUse}
                    onChange={() => setNewCouponSingleUse(!newCouponSingleUse)}
                  />
                  <label
                    htmlFor="new_coupon_single"
                    className="text-sm font-medium text-gray-700"
                  >
                    Single use per customer
                  </label>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setCouponDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleCreateCoupon} disabled={couponSaving}>
            {couponSaving ? 'Creating...' : 'Create Coupon'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* -- Message Preview Dialog -- */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogClose onClose={() => setPreviewDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>Message Preview</DialogTitle>
        </DialogHeader>
        <DialogContent>
          {loadingPreviewSample ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            </div>
          ) : previewCustomers.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">
              No matching customers found. Adjust your audience filters.
            </p>
          ) : (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
              {/* Customer selector */}
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <button
                  type="button"
                  disabled={previewIndex <= 0}
                  onClick={() => setPreviewIndex((i) => i - 1)}
                  className="rounded p-1 hover:bg-gray-200 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {previewCustomers[previewIndex].first_name}{' '}
                    {previewCustomers[previewIndex].last_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {previewIndex + 1} of {previewCustomers.length} recipients
                  </p>
                </div>
                <button
                  type="button"
                  disabled={previewIndex >= previewCustomers.length - 1}
                  onClick={() => setPreviewIndex((i) => i + 1)}
                  className="rounded p-1 hover:bg-gray-200 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Coupon code note */}
              {couponId && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Coupon codes shown are samples. Each recipient will receive their own unique code when the campaign is sent.
                </p>
              )}

              {/* Rendered messages */}
              {(() => {
                const { variantA, variantB } = renderPreviewForCustomer(
                  previewCustomers[previewIndex]
                );

                const renderVariantPreview = (
                  variant: typeof variantA,
                  label?: string,
                  borderColor?: string
                ) => (
                  <div className={label ? `rounded-lg border ${borderColor} p-3` : ''}>
                    {label && (
                      <p className="mb-2 text-xs font-semibold text-gray-600">{label}</p>
                    )}
                    {(channel === 'sms' || channel === 'both') &&
                      variant.sms && (
                        <div className="mb-2">
                          <p className="mb-1 text-xs font-medium text-gray-500">
                            SMS to{' '}
                            {previewCustomers[previewIndex].phone || 'N/A'}
                          </p>
                          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                            <p className="whitespace-pre-wrap text-sm">
                              {variant.sms}
                            </p>
                          </div>
                        </div>
                      )}
                    {(channel === 'email' || channel === 'both') &&
                      variant.email && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-gray-500">
                            Email to{' '}
                            {previewCustomers[previewIndex].email || 'N/A'}
                          </p>
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                            {variant.subject && (
                              <p className="mb-2 text-sm font-medium">
                                Subject: {variant.subject}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap text-sm">
                              {variant.email}
                            </p>
                          </div>
                        </div>
                      )}
                  </div>
                );

                if (variantB) {
                  return (
                    <div className="space-y-4">
                      {renderVariantPreview(variantA, `Variant A (${splitPercentage}%)`, 'border-blue-200 bg-blue-50/30')}
                      {renderVariantPreview(variantB, `Variant B (${100 - splitPercentage}%)`, 'border-yellow-200 bg-yellow-50/30')}
                    </div>
                  );
                }

                return renderVariantPreview(variantA);
              })()}
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setPreviewDialogOpen(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
