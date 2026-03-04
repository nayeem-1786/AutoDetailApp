'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { createClient } from '@/lib/supabase/client';
import { DripStepsEditor } from './drip-steps-editor';
import type { StepFormData } from './drip-step-card';

// ─── Types ────────────────────────────────────────────────────────

interface DripSequenceWithSteps {
  id: string;
  name: string;
  description: string | null;
  trigger_condition: string;
  trigger_value: Record<string, unknown> | null;
  stop_conditions: {
    on_purchase: boolean;
    on_booking: boolean;
    on_reply: boolean;
  };
  nurture_sequence_id: string | null;
  is_active: boolean;
  audience_filters: Record<string, unknown> | null;
  steps: Array<Record<string, unknown>>;
}

interface DripBuilderProps {
  initialData?: DripSequenceWithSteps;
}

// ─── Reference data types ─────────────────────────────────────────

interface ServiceOption {
  id: string;
  name: string;
}

interface CouponOption {
  id: string;
  code: string;
  name: string | null;
}

interface TemplateOption {
  id: string;
  name: string;
  subject: string;
}

interface SequenceOption {
  id: string;
  name: string;
}

// ─── Component ────────────────────────────────────────────────────

export function DripBuilder({ initialData }: DripBuilderProps) {
  const router = useRouter();

  // ── Form state ──────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerCondition, setTriggerCondition] = useState('no_visit_days');
  const [triggerValue, setTriggerValue] = useState<Record<string, unknown>>({});
  const [steps, setSteps] = useState<StepFormData[]>([]);
  const [stopOnPurchase, setStopOnPurchase] = useState(true);
  const [stopOnBooking, setStopOnBooking] = useState(true);
  const [stopOnReply, setStopOnReply] = useState(false);
  const [nurtureSequenceId, setNurtureSequenceId] = useState('');

  // ── UI state ────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Reference data ──────────────────────────────────────────────
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [coupons, setCoupons] = useState<CouponOption[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<TemplateOption[]>([]);
  const [sequences, setSequences] = useState<SequenceOption[]>([]);

  // ── Load reference data ─────────────────────────────────────────
  useEffect(() => {
    async function loadReferenceData() {
      try {
        const supabase = createClient();
        const [servicesRes, couponsRes, templatesRes, sequencesRes] =
          await Promise.all([
            supabase
              .from('services')
              .select('id, name')
              .eq('is_active', true)
              .order('name'),
            supabase
              .from('coupons')
              .select('id, code, name')
              .eq('status', 'active')
              .order('code'),
            supabase
              .from('email_templates')
              .select('id, name, subject')
              .order('name'),
            supabase
              .from('drip_sequences')
              .select('id, name')
              .order('name'),
          ]);

        if (servicesRes.data) setServices(servicesRes.data);
        if (couponsRes.data) setCoupons(couponsRes.data);
        if (templatesRes.data) setEmailTemplates(templatesRes.data);
        if (sequencesRes.data) {
          // Filter out the current sequence from the sequences list to prevent self-reference
          const filtered = initialData
            ? sequencesRes.data.filter((s: SequenceOption) => s.id !== initialData.id)
            : sequencesRes.data;
          setSequences(filtered);
        }
      } catch (err) {
        console.error('Failed to load reference data:', err);
        toast.error('Failed to load form data');
      } finally {
        setLoading(false);
      }
    }

    loadReferenceData();
  }, [initialData]);

  // ── Initialize from existing data ──────────────────────────────
  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setDescription(initialData.description || '');
      setTriggerCondition(initialData.trigger_condition);
      setTriggerValue(initialData.trigger_value || {});
      setStopOnPurchase(initialData.stop_conditions?.on_purchase ?? true);
      setStopOnBooking(initialData.stop_conditions?.on_booking ?? true);
      setStopOnReply(initialData.stop_conditions?.on_reply ?? false);
      setNurtureSequenceId(initialData.nurture_sequence_id || '');
      setSteps(
        initialData.steps.map((s: Record<string, unknown>) => ({
          id: s.id as string,
          step_order: s.step_order as number,
          delay_days: (s.delay_days as number) || 0,
          delay_hours: (s.delay_hours as number) || 0,
          channel: (s.channel as 'email' | 'sms' | 'both') || 'email',
          template_id: (s.template_id as string) || '',
          sms_template: (s.sms_template as string) || '',
          coupon_id: (s.coupon_id as string) || '',
          subject_override: (s.subject_override as string) || '',
          exit_condition: (s.exit_condition as string) || '',
          exit_action: (s.exit_action as string) || '',
          exit_sequence_id: (s.exit_sequence_id as string) || '',
          exit_tag: (s.exit_tag as string) || '',
          is_active: (s.is_active as boolean) ?? true,
          expanded: false,
        }))
      );
    }
  }, [initialData]);

  // ── Save handler ────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        trigger_condition: triggerCondition,
        trigger_value:
          Object.keys(triggerValue).length > 0 ? triggerValue : null,
        stop_conditions: {
          on_purchase: stopOnPurchase,
          on_booking: stopOnBooking,
          on_reply: stopOnReply,
        },
        nurture_sequence_id: nurtureSequenceId || null,
        audience_filters: null,
        steps: steps.map((s, i) => ({
          // Only include `id` for existing DB steps (real UUIDs, not temp- prefixed)
          ...(s.id.length === 36 && !s.id.startsWith('temp-')
            ? { id: s.id }
            : {}),
          step_order: i,
          delay_days: s.delay_days,
          delay_hours: s.delay_hours,
          channel: s.channel,
          template_id: s.template_id || null,
          sms_template: s.sms_template || null,
          coupon_id: s.coupon_id || null,
          subject_override: s.subject_override || null,
          exit_condition: s.exit_condition || null,
          exit_action: s.exit_action || null,
          exit_sequence_id: s.exit_sequence_id || null,
          exit_tag: s.exit_tag || null,
          is_active: s.is_active,
        })),
      };

      const isEdit = !!initialData?.id;
      const url = isEdit
        ? `/api/admin/drip-sequences/${initialData.id}`
        : '/api/admin/drip-sequences';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Failed to save sequence');
        return;
      }

      toast.success(isEdit ? 'Sequence updated' : 'Sequence created');

      if (!isEdit && json.data?.id) {
        // Navigate to the edit page for the new sequence
        router.push(`/admin/marketing/campaigns/drip/${json.data.id}`);
      } else if (isEdit && json.data) {
        // Update steps with server-assigned IDs
        const updatedSteps = (json.data.steps || []).map(
          (s: Record<string, unknown>) => ({
            id: s.id as string,
            step_order: s.step_order as number,
            delay_days: (s.delay_days as number) || 0,
            delay_hours: (s.delay_hours as number) || 0,
            channel: (s.channel as 'email' | 'sms' | 'both') || 'email',
            template_id: (s.template_id as string) || '',
            sms_template: (s.sms_template as string) || '',
            coupon_id: (s.coupon_id as string) || '',
            subject_override: (s.subject_override as string) || '',
            exit_condition: (s.exit_condition as string) || '',
            exit_action: (s.exit_action as string) || '',
            exit_sequence_id: (s.exit_sequence_id as string) || '',
            exit_tag: (s.exit_tag as string) || '',
            is_active: (s.is_active as boolean) ?? true,
            expanded: false,
          })
        );
        setSteps(updatedSteps);
      }
    } catch (err) {
      console.error('Failed to save sequence:', err);
      toast.error('Failed to save sequence');
    } finally {
      setSaving(false);
    }
  }

  // ── Trigger value helpers ──────────────────────────────────────
  function updateTriggerValue(key: string, value: unknown) {
    setTriggerValue((prev) => ({ ...prev, [key]: value }));
  }

  // ── Loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const isEdit = !!initialData?.id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/admin/marketing/campaigns')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span>
              {isEdit ? `Edit: ${initialData.name}` : 'Create Drip Sequence'}
            </span>
          </div>
        }
      />

      {/* ── Basics Card ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Name" htmlFor="seq-name" required>
            <Input
              id="seq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Win-Back Lapsed Customers"
            />
          </FormField>
          <FormField label="Description" htmlFor="seq-desc">
            <Textarea
              id="seq-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the purpose of this sequence..."
              rows={2}
            />
          </FormField>
        </CardContent>
      </Card>

      {/* ── Trigger Card ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Trigger Type" htmlFor="seq-trigger">
            <Select
              id="seq-trigger"
              value={triggerCondition}
              onChange={(e) => {
                setTriggerCondition(e.target.value);
                setTriggerValue({});
              }}
            >
              <option value="no_visit_days">No Visit (Lapsed)</option>
              <option value="after_service">After Service</option>
              <option value="new_customer">New Customer</option>
              <option value="manual_enroll">Manual Enrollment</option>
              <option value="tag_added">Tag Added</option>
            </Select>
          </FormField>

          {/* Dynamic trigger config */}
          {triggerCondition === 'no_visit_days' && (
            <FormField
              label="Days since last visit"
              htmlFor="trigger-days"
              description="Customers who have not visited within this many days will be enrolled"
            >
              <Input
                id="trigger-days"
                type="number"
                min={1}
                value={(triggerValue.days as number) || ''}
                onChange={(e) =>
                  updateTriggerValue(
                    'days',
                    parseInt(e.target.value) || 0
                  )
                }
                placeholder="e.g. 60"
              />
            </FormField>
          )}

          {triggerCondition === 'after_service' && (
            <FormField label="Service" htmlFor="trigger-service">
              <Select
                id="trigger-service"
                value={(triggerValue.service_id as string) || ''}
                onChange={(e) =>
                  updateTriggerValue('service_id', e.target.value)
                }
              >
                <option value="">Select a service...</option>
                {services.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          {triggerCondition === 'new_customer' && (
            <FormField
              label="Within last N days"
              htmlFor="trigger-new-days"
              description="Customers who signed up within this window will be enrolled"
            >
              <Input
                id="trigger-new-days"
                type="number"
                min={1}
                value={(triggerValue.days as number) || ''}
                onChange={(e) =>
                  updateTriggerValue(
                    'days',
                    parseInt(e.target.value) || 7
                  )
                }
                placeholder="7"
              />
            </FormField>
          )}

          {triggerCondition === 'manual_enroll' && (
            <p className="text-sm text-ui-text-muted">
              Customers are enrolled manually from the Enrollments tab or customer
              detail page. No automatic trigger.
            </p>
          )}

          {triggerCondition === 'tag_added' && (
            <FormField
              label="Tag"
              htmlFor="trigger-tag"
              description="Customer will be enrolled when this tag is added"
            >
              <Input
                id="trigger-tag"
                value={(triggerValue.tag as string) || ''}
                onChange={(e) => updateTriggerValue('tag', e.target.value)}
                placeholder="e.g. vip, ceramic-interested"
              />
            </FormField>
          )}
        </CardContent>
      </Card>

      {/* ── Steps Card ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <DripStepsEditor
            steps={steps}
            onStepsChange={setSteps}
            emailTemplates={emailTemplates}
            coupons={coupons}
            sequences={sequences}
          />
        </CardContent>
      </Card>

      {/* ── Stop Conditions Card ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Stop Conditions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <Checkbox
              checked={stopOnPurchase}
              onChange={(e) =>
                setStopOnPurchase(
                  (e.target as HTMLInputElement).checked
                )
              }
            />
            <span className="text-sm text-ui-text">
              Stop when customer makes a purchase
            </span>
          </label>

          <label className="flex items-center gap-3">
            <Checkbox
              checked={stopOnBooking}
              onChange={(e) =>
                setStopOnBooking(
                  (e.target as HTMLInputElement).checked
                )
              }
            />
            <span className="text-sm text-ui-text">
              Stop when customer books an appointment
            </span>
          </label>

          <label className="flex items-center gap-3">
            <Checkbox
              checked={stopOnReply}
              onChange={(e) =>
                setStopOnReply(
                  (e.target as HTMLInputElement).checked
                )
              }
            />
            <span className="text-sm text-ui-text">
              Stop when customer replies
            </span>
          </label>

          <FormField
            label="When stopped, transfer to:"
            htmlFor="nurture-seq"
            description="Optionally move customers into another sequence when they exit this one"
          >
            <Select
              id="nurture-seq"
              value={nurtureSequenceId}
              onChange={(e) => setNurtureSequenceId(e.target.value)}
            >
              <option value="">None</option>
              {sequences.map((seq) => (
                <option key={seq.id} value={seq.id}>
                  {seq.name}
                </option>
              ))}
            </Select>
          </FormField>
        </CardContent>
      </Card>

      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => router.push('/admin/marketing/campaigns')}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Sequence'}
        </Button>
      </div>
    </div>
  );
}
