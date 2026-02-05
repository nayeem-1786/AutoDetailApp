'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { createClient } from '@/lib/supabase/client';
import { businessProfileSchema, businessHoursSchema, type BusinessProfileInput, type BusinessHoursInput } from '@/lib/utils/validation';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { formatPhone, formatPhoneInput } from '@/lib/utils/format';
import { toast } from 'sonner';

const DAY_LABELS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
] as const;

type DayKey = typeof DAY_LABELS[number]['key'];

export default function BusinessProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [hours, setHours] = useState<BusinessHoursInput>({
    monday: { open: '08:00', close: '18:00' },
    tuesday: { open: '08:00', close: '18:00' },
    wednesday: { open: '08:00', close: '18:00' },
    thursday: { open: '08:00', close: '18:00' },
    friday: { open: '08:00', close: '18:00' },
    saturday: { open: '08:00', close: '18:00' },
    sunday: null,
  });
  const [hoursDirty, setHoursDirty] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<BusinessProfileInput>({
    resolver: formResolver(businessProfileSchema),
    defaultValues: {
      business_name: '',
      business_phone: '',
      business_address: {
        line1: '',
        city: '',
        state: '',
        zip: '',
      },
      business_email: '',
      business_website: '',
    },
  });

  useEffect(() => {
    async function loadSettings() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('business_settings')
        .select('key, value')
        .in('key', ['business_name', 'business_phone', 'business_address', 'business_email', 'business_website', 'business_hours']);

      if (error) {
        toast.error('Failed to load business settings', {
          description: error.message,
        });
        setLoading(false);
        return;
      }

      const settings: Record<string, unknown> = {};
      for (const row of data || []) {
        settings[row.key] = row.value;
      }

      // Convert any stored format (E.164 or raw) to (XXX) XXX-XXXX for display
      const rawPhone = (settings.business_phone as string) || '';
      const displayPhone = rawPhone ? formatPhone(rawPhone) : '';

      reset({
        business_name: (settings.business_name as string) || '',
        business_phone: displayPhone,
        business_address: (settings.business_address as BusinessProfileInput['business_address']) || {
          line1: '',
          city: '',
          state: '',
          zip: '',
        },
        business_email: (settings.business_email as string) || '',
        business_website: (settings.business_website as string) || '',
      });

      // Load business hours
      if (settings.business_hours) {
        const parsed = businessHoursSchema.safeParse(settings.business_hours);
        if (parsed.success) {
          setHours(parsed.data);
        }
      }

      setLoading(false);
    }

    loadSettings();
  }, [reset]);

  async function onSubmit(formData: BusinessProfileInput) {
    setSaving(true);
    const supabase = createClient();

    const entries = [
      { key: 'business_name', value: formData.business_name },
      { key: 'business_phone', value: formData.business_phone },
      { key: 'business_address', value: formData.business_address },
      { key: 'business_email', value: formData.business_email || null },
      { key: 'business_website', value: formData.business_website || null },
    ];

    for (const entry of entries) {
      const { error } = await supabase
        .from('business_settings')
        .upsert(
          {
            key: entry.key,
            value: entry.value as unknown,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

      if (error) {
        toast.error(`Failed to save ${entry.key}`, {
          description: error.message,
        });
        setSaving(false);
        return;
      }
    }

    toast.success('Business profile updated');
    reset(formData);
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Business Profile"
          description="Update your business information."
        />
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  function toggleDayOpen(day: DayKey) {
    setHours((prev) => ({
      ...prev,
      [day]: prev[day] ? null : { open: '08:00', close: '18:00' },
    }));
    setHoursDirty(true);
  }

  function updateDayTime(day: DayKey, field: 'open' | 'close', value: string) {
    setHours((prev) => {
      const current = prev[day];
      if (!current) return prev;
      return {
        ...prev,
        [day]: { ...current, [field]: value },
      };
    });
    setHoursDirty(true);
  }

  async function saveHours() {
    setSavingHours(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('business_settings')
      .upsert(
        {
          key: 'business_hours',
          value: hours as unknown,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (error) {
      toast.error('Failed to save business hours', {
        description: error.message,
      });
    } else {
      toast.success('Business hours updated');
      setHoursDirty(false);
    }
    setSavingHours(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Profile"
        description="Update your business name, contact info, and address."
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Business Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              label="Business Name"
              required
              error={errors.business_name?.message}
              htmlFor="business_name"
            >
              <Input
                id="business_name"
                placeholder="Smart Detail Auto Spa"
                {...register('business_name')}
              />
            </FormField>

            <FormField
              label="Business Phone"
              error={errors.business_phone?.message}
              htmlFor="business_phone"
            >
              <Input
                id="business_phone"
                placeholder="(310) 555-1234"
                {...register('business_phone', {
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    const formatted = formatPhoneInput(e.target.value);
                    setValue('business_phone', formatted, { shouldDirty: true, shouldValidate: true });
                  },
                })}
              />
            </FormField>

            <FormField
              label="Business Email"
              error={errors.business_email?.message}
              htmlFor="business_email"
            >
              <Input
                id="business_email"
                type="email"
                placeholder="info@yourbusiness.com"
                {...register('business_email')}
              />
            </FormField>

            <FormField
              label="Website"
              error={errors.business_website?.message}
              htmlFor="business_website"
            >
              <Input
                id="business_website"
                type="url"
                placeholder="https://yourbusiness.com"
                {...register('business_website')}
              />
            </FormField>

            <div className="border-t border-gray-200 pt-4">
              <h4 className="mb-3 text-sm font-medium text-gray-700">
                Business Address
              </h4>
              <div className="space-y-4">
                <FormField
                  label="Street Address"
                  required
                  error={errors.business_address?.line1?.message}
                  htmlFor="address_line1"
                >
                  <Input
                    id="address_line1"
                    placeholder="123 Main St"
                    {...register('business_address.line1')}
                  />
                </FormField>

                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    label="City"
                    required
                    error={errors.business_address?.city?.message}
                    htmlFor="address_city"
                  >
                    <Input
                      id="address_city"
                      placeholder="Torrance"
                      {...register('business_address.city')}
                    />
                  </FormField>

                  <FormField
                    label="State"
                    required
                    error={errors.business_address?.state?.message}
                    htmlFor="address_state"
                  >
                    <Input
                      id="address_state"
                      placeholder="CA"
                      {...register('business_address.state')}
                    />
                  </FormField>

                  <FormField
                    label="ZIP Code"
                    required
                    error={errors.business_address?.zip?.message}
                    htmlFor="address_zip"
                  >
                    <Input
                      id="address_zip"
                      placeholder="90501"
                      {...register('business_address.zip')}
                    />
                  </FormField>
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-200 pt-4">
              <Button type="submit" disabled={saving || !isDirty}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Business Hours */}
      <Card>
        <CardHeader>
          <CardTitle>Business Hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {DAY_LABELS.map(({ key, label }) => {
            const dayHours = hours[key];
            const isOpen = dayHours !== null;

            return (
              <div
                key={key}
                className="flex items-center gap-4 border-b border-gray-100 pb-3 last:border-0 last:pb-0"
              >
                <div className="w-28 text-sm font-medium text-gray-700">
                  {label}
                </div>
                <Switch
                  checked={isOpen}
                  onCheckedChange={() => toggleDayOpen(key)}
                />
                {isOpen && dayHours ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={dayHours.open}
                      onChange={(e) =>
                        updateDayTime(key, 'open', e.target.value)
                      }
                      className="w-32"
                    />
                    <span className="text-sm text-gray-500">to</span>
                    <Input
                      type="time"
                      value={dayHours.close}
                      onChange={(e) =>
                        updateDayTime(key, 'close', e.target.value)
                      }
                      className="w-32"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">Closed</span>
                )}
              </div>
            );
          })}

          <div className="flex justify-end border-t border-gray-200 pt-4">
            <Button
              type="button"
              onClick={saveHours}
              disabled={savingHours || !hoursDirty}
            >
              {savingHours ? 'Saving...' : 'Save Hours'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
