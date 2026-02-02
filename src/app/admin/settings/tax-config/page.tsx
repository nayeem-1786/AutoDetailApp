'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { formResolver } from '@/lib/utils/form';
import { createClient } from '@/lib/supabase/client';
import { taxConfigSchema, type TaxConfigInput } from '@/lib/utils/validation';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/ui/form-field';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';

// Internal form uses percentage display (0-100 range) for user clarity
interface TaxFormValues {
  tax_rate_display: string;
  tax_products_only: boolean;
}

export default function TaxConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<TaxFormValues>({
    defaultValues: {
      tax_rate_display: '',
      tax_products_only: false,
    },
  });

  useEffect(() => {
    async function loadSettings() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('business_settings')
        .select('key, value')
        .in('key', ['tax_rate', 'tax_products_only']);

      if (error) {
        toast.error('Failed to load tax settings', {
          description: error.message,
        });
        setLoading(false);
        return;
      }

      const settings: Record<string, unknown> = {};
      for (const row of data || []) {
        settings[row.key] = row.value;
      }

      const rateDecimal = typeof settings.tax_rate === 'number' ? settings.tax_rate : 0;
      const ratePercent = (rateDecimal * 100).toFixed(2);

      reset({
        tax_rate_display: ratePercent,
        tax_products_only: settings.tax_products_only === true,
      });

      setLoading(false);
    }

    loadSettings();
  }, [reset]);

  async function onSubmit(formData: TaxFormValues) {
    // Convert display percentage (e.g. 10.25) to decimal (0.1025)
    const rateDecimal = parseFloat(formData.tax_rate_display) / 100;

    // Validate with the canonical schema
    const result = taxConfigSchema.safeParse({
      tax_rate: rateDecimal,
      tax_products_only: formData.tax_products_only,
    });

    if (!result.success) {
      const issue = result.error.issues[0];
      toast.error('Validation error', { description: issue?.message || 'Invalid input' });
      return;
    }

    const validated: TaxConfigInput = result.data;
    setSaving(true);

    const supabase = createClient();

    const entries = [
      { key: 'tax_rate', value: validated.tax_rate },
      { key: 'tax_products_only', value: validated.tax_products_only },
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

    toast.success('Tax configuration updated');
    reset(formData);
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Tax Configuration"
          description="Configure tax rates and tax behavior."
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
        title="Tax Configuration"
        description="Configure tax rates and choose which items are taxed."
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Tax Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              label="Tax Rate"
              required
              error={errors.tax_rate_display?.message}
              description="Enter the tax rate as a percentage (e.g. 10.25 for 10.25%). Stored as a decimal internally."
              htmlFor="tax_rate_display"
            >
              <div className="relative max-w-xs">
                <Input
                  id="tax_rate_display"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="10.25"
                  {...register('tax_rate_display', {
                    required: 'Tax rate is required',
                    validate: (value) => {
                      const num = parseFloat(value);
                      if (isNaN(num)) return 'Must be a number';
                      if (num < 0 || num > 100) return 'Must be between 0 and 100';
                      return true;
                    },
                  })}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  %
                </span>
              </div>
            </FormField>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div>
                <Label htmlFor="tax_products_only">Products Only</Label>
                <p className="mt-0.5 text-sm text-gray-500">
                  When enabled, tax is applied only to products. Services will not be taxed.
                </p>
              </div>
              <Controller
                name="tax_products_only"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="tax_products_only"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
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
