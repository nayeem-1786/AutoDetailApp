'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { createClient } from '@/lib/supabase/client';
import { businessProfileSchema, type BusinessProfileInput } from '@/lib/utils/validation';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';

export default function BusinessProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
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
    },
  });

  useEffect(() => {
    async function loadSettings() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('business_settings')
        .select('key, value')
        .in('key', ['business_name', 'business_phone', 'business_address']);

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

      reset({
        business_name: (settings.business_name as string) || '',
        business_phone: (settings.business_phone as string) || '',
        business_address: (settings.business_address as BusinessProfileInput['business_address']) || {
          line1: '',
          city: '',
          state: '',
          zip: '',
        },
      });

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
              description="Format: +1XXXXXXXXXX"
              htmlFor="business_phone"
            >
              <Input
                id="business_phone"
                placeholder="+13105551234"
                {...register('business_phone')}
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
    </div>
  );
}
