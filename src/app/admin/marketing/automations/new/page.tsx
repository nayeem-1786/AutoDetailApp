'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Spinner } from '@/components/ui/spinner';
import { ArrowLeft } from 'lucide-react';

export default function NewAutomationPage() {
  const router = useRouter();
  const supabase = createClient();
  const [services, setServices] = useState<Service[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<LifecycleRuleInput>({
    resolver: formResolver(lifecycleRuleSchema),
    defaultValues: {
      name: '',
      description: '',
      trigger_condition: 'service_completed',
      trigger_service_id: null,
      delay_days: 7,
      delay_minutes: 0,
      action: 'sms',
      sms_template: '',
      email_subject: '',
      email_template: '',
      coupon_type: null,
      coupon_value: null,
      coupon_expiry_days: null,
      is_active: true,
      is_vehicle_aware: false,
      chain_order: 0,
    },
  });

  const watchAction = watch('action');
  const watchSmsTemplate = watch('sms_template') || '';
  const watchEmailTemplate = watch('email_template') || '';

  useEffect(() => {
    async function load() {
      setLoadingOptions(true);
      const { data } = await supabase
        .from('services')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (data) setServices(data as Service[]);
      setLoadingOptions(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function insertVariable(field: 'sms_template' | 'email_template', variable: string) {
    const current = field === 'sms_template' ? watchSmsTemplate : watchEmailTemplate;
    setValue(field, `${current}{${variable}}`);
  }

  async function onSubmit(data: LifecycleRuleInput) {
    setSaving(true);
    try {
      const res = await fetch('/api/marketing/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || 'Failed to create rule');
        return;
      }

      toast.success('Automation rule created');
      router.push('/admin/marketing/automations');
    } catch {
      toast.error('Failed to create rule');
    } finally {
      setSaving(false);
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

  if (loadingOptions) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Automation Rule"
        action={
          <Button variant="outline" onClick={() => router.push('/admin/marketing/automations')}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Trigger */}
        <Card>
          <CardHeader><CardTitle>Trigger</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <FormField label="Rule Name" error={errors.name?.message} required htmlFor="name">
                <Input id="name" {...register('name')} placeholder="e.g. Post-Ceramic Follow-Up" />
              </FormField>
              <FormField label="Description" error={errors.description?.message} htmlFor="description">
                <Input id="description" {...register('description')} placeholder="Optional description" />
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
              <FormField label="Chain Order" error={errors.chain_order?.message} htmlFor="chain_order" description="Order in multi-step sequences">
                <Input id="chain_order" type="number" min="0" {...register('chain_order')} />
              </FormField>
            </div>
          </CardContent>
        </Card>

        {/* Action */}
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
                    <Textarea
                      id="sms_template"
                      {...register('sms_template')}
                      rows={4}
                      placeholder="Hi {first_name}, it's been a while since your last visit..."
                    />
                  </FormField>
                  {variableChips('sms_template')}
                </div>
              )}

              {(watchAction === 'email' || watchAction === 'both') && (
                <>
                  <FormField label="Email Subject" error={errors.email_subject?.message} htmlFor="email_subject">
                    <Input id="email_subject" {...register('email_subject')} placeholder="Time for another detail, {first_name}!" />
                  </FormField>
                  <div>
                    <FormField label="Email Body" error={errors.email_template?.message} htmlFor="email_template">
                      <Textarea
                        id="email_template"
                        {...register('email_template')}
                        rows={6}
                        placeholder="Hi {first_name},&#10;&#10;It's been a while since your last visit..."
                      />
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
            <div className="grid gap-6 md:grid-cols-3">
              <FormField label="Coupon Type" error={errors.coupon_type?.message} htmlFor="coupon_type">
                <Select id="coupon_type" {...register('coupon_type')}>
                  <option value="">No coupon</option>
                  <option value="percentage">Percentage</option>
                  <option value="flat">Flat Amount</option>
                  <option value="free_addon">Free Add-On</option>
                  <option value="free_product">Free Product</option>
                </Select>
              </FormField>
              <FormField label="Coupon Value" error={errors.coupon_value?.message} htmlFor="coupon_value">
                <Input id="coupon_value" type="number" step="0.01" min="0" {...register('coupon_value')} placeholder="e.g. 15" />
              </FormField>
              <FormField label="Coupon Expiry (days)" error={errors.coupon_expiry_days?.message} htmlFor="coupon_expiry_days">
                <Input id="coupon_expiry_days" type="number" min="1" {...register('coupon_expiry_days')} placeholder="e.g. 30" />
              </FormField>
            </div>
          </CardContent>
        </Card>

        {/* Options */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Checkbox id="is_active" {...register('is_active')} defaultChecked />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                  Active (enable immediately)
                </label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox id="is_vehicle_aware" {...register('is_vehicle_aware')} />
                <label htmlFor="is_vehicle_aware" className="text-sm font-medium text-gray-700">
                  Vehicle-aware (include vehicle info in messages)
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push('/admin/marketing/automations')}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Creating...' : 'Create Rule'}
          </Button>
        </div>
      </form>
    </div>
  );
}
