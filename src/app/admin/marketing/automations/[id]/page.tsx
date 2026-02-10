'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { lifecycleRuleSchema, type LifecycleRuleInput } from '@/lib/utils/validation';
import type { Service } from '@/lib/supabase/types';
import { TEMPLATE_VARIABLES } from '@/lib/utils/template';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface CouponOption {
  id: string;
  name: string | null;
  code: string;
  summary: string;
}

export default function AutomationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();

  const [services, setServices] = useState<Service[]>([]);
  const [coupons, setCoupons] = useState<CouponOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<LifecycleRuleInput>({
    resolver: formResolver(lifecycleRuleSchema),
  });

  const watchAction = watch('action');
  const watchSmsTemplate = watch('sms_template') || '';
  const watchEmailTemplate = watch('email_template') || '';

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [ruleRes, servicesRes, couponsRes] = await Promise.all([
        fetch(`/api/marketing/automations/${id}`),
        supabase.from('services').select('id, name').eq('is_active', true).order('name'),
        supabase
          .from('coupons')
          .select('id, name, code, coupon_rewards(discount_type, discount_value)')
          .eq('status', 'active')
          .order('name'),
      ]);

      if (servicesRes.data) setServices(servicesRes.data as Service[]);
      if (couponsRes.data) {
        setCoupons(
          couponsRes.data.map((c: { id: string; name: string | null; code: string; coupon_rewards: Array<{ discount_type: string; discount_value: number }> | null }) => {
            const rewards = (c.coupon_rewards || []) as Array<{ discount_type: string; discount_value: number }>;
            const summary = rewards.length > 0
              ? rewards.map((r) => {
                  if (r.discount_type === 'percentage') return `${r.discount_value}% off`;
                  if (r.discount_type === 'flat') return `$${r.discount_value} off`;
                  return 'Free';
                }).join(', ')
              : 'No rewards';
            return { id: c.id, name: c.name, code: c.code, summary };
          })
        );
      }

      if (ruleRes.ok) {
        const { data } = await ruleRes.json();
        reset({
          name: data.name,
          description: data.description || '',
          trigger_condition: data.trigger_condition,
          trigger_service_id: data.trigger_service_id || null,
          delay_days: data.delay_days,
          delay_minutes: data.delay_minutes ?? 0,
          action: data.action,
          sms_template: data.sms_template || '',
          email_subject: data.email_subject || '',
          email_template: data.email_template || '',
          coupon_id: data.coupon_id || null,
          is_active: data.is_active,
          is_vehicle_aware: data.is_vehicle_aware,
          chain_order: data.chain_order,
        });
      }
      setLoading(false);
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function insertVariable(field: 'sms_template' | 'email_template', variable: string) {
    const current = field === 'sms_template' ? watchSmsTemplate : watchEmailTemplate;
    setValue(field, `${current}{${variable}}`);
  }

  async function onSubmit(data: LifecycleRuleInput) {
    setSaving(true);
    try {
      const res = await fetch(`/api/marketing/automations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const { error } = await res.json();
        toast.error(error || 'Failed to update');
        return;
      }

      toast.success('Automation rule updated');
    } catch {
      toast.error('Failed to update rule');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/marketing/automations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Rule deleted');
        router.push('/admin/marketing/automations');
      } else {
        toast.error('Failed to delete');
      }
    } catch {
      toast.error('Failed to delete rule');
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  const variableChips = (field: 'sms_template' | 'email_template') => (
    <div className="mt-2 flex flex-wrap gap-1">
      {Object.entries(TEMPLATE_VARIABLES).map(([key, desc]) => (
        <button
          key={key}
          type="button"
          onClick={() => insertVariable(field, key)}
          className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
          title={desc}
        >
          {`{${key}}`}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Automation Rule"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button variant="outline" onClick={() => router.push('/admin/marketing/automations')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Trigger</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <FormField label="Rule Name" error={errors.name?.message} required htmlFor="name">
                <Input id="name" {...register('name')} />
              </FormField>
              <FormField label="Description" error={errors.description?.message} htmlFor="description">
                <Input id="description" {...register('description')} />
              </FormField>
              <FormField label="Trigger Condition" error={errors.trigger_condition?.message} required htmlFor="trigger_condition">
                <Select id="trigger_condition" {...register('trigger_condition')}>
                  <option value="service_completed">After Service (appointment completed)</option>
                  <option value="after_transaction">After Transaction (POS checkout)</option>
                  <option value="no_visit_days">No Visit (Days)</option>
                  <option value="birthday">Birthday</option>
                </Select>
              </FormField>
              <FormField label="Trigger Service" error={errors.trigger_service_id?.message} htmlFor="trigger_service_id">
                <Select id="trigger_service_id" {...register('trigger_service_id')}>
                  <option value="">Any service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </FormField>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Delay</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input id="delay_days" type="number" min="0" {...register('delay_days')} />
                    <span className="mt-1 block text-xs text-gray-500">days</span>
                  </div>
                  <div className="flex-1">
                    <Input id="delay_minutes" type="number" min="0" max="1439" {...register('delay_minutes')} />
                    <span className="mt-1 block text-xs text-gray-500">minutes</span>
                  </div>
                </div>
                {(errors.delay_days?.message || errors.delay_minutes?.message) && (
                  <p className="mt-1 text-sm text-red-600">{errors.delay_days?.message || errors.delay_minutes?.message}</p>
                )}
              </div>
              <FormField label="Chain Order" error={errors.chain_order?.message} htmlFor="chain_order">
                <Input id="chain_order" type="number" min="0" {...register('chain_order')} />
              </FormField>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Action</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-6">
              <FormField label="Send Via" error={errors.action?.message} required htmlFor="action">
                <Select id="action" {...register('action')}>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="both">SMS + Email</option>
                </Select>
              </FormField>
              {(watchAction === 'sms' || watchAction === 'both') && (
                <div>
                  <FormField label="SMS Template" error={errors.sms_template?.message} htmlFor="sms_template">
                    <Textarea id="sms_template" {...register('sms_template')} rows={4} />
                  </FormField>
                  {variableChips('sms_template')}
                </div>
              )}
              {(watchAction === 'email' || watchAction === 'both') && (
                <>
                  <FormField label="Email Subject" error={errors.email_subject?.message} htmlFor="email_subject">
                    <Input id="email_subject" {...register('email_subject')} />
                  </FormField>
                  <div>
                    <FormField label="Email Body" error={errors.email_template?.message} htmlFor="email_template">
                      <Textarea id="email_template" {...register('email_template')} rows={6} />
                    </FormField>
                    {variableChips('email_template')}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Coupon */}
        <Card>
          <CardHeader><CardTitle>Coupon (Optional)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <FormField label="Attach Coupon" error={errors.coupon_id?.message} htmlFor="coupon_id">
                <Select id="coupon_id" {...register('coupon_id')}>
                  <option value="">None</option>
                  {coupons.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || 'Unnamed'} ({c.code}) — {c.summary}
                    </option>
                  ))}
                </Select>
              </FormField>
              <Link
                href="/admin/marketing/coupons"
                className="inline-block text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                Manage coupons →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Checkbox id="is_active" {...register('is_active')} />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">Active</label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox id="is_vehicle_aware" {...register('is_vehicle_aware')} />
                <label htmlFor="is_vehicle_aware" className="text-sm font-medium text-gray-700">Vehicle-aware</label>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push('/admin/marketing/automations')}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Automation Rule"
        description="This will permanently delete this automation rule. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
