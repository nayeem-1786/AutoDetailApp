'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';

const SETTINGS_KEY = 'pos_idle_timeout_minutes';
const DEFAULT_TIMEOUT = 15;

interface TimeoutForm {
  minutes: string;
}

export default function PosIdleTimeoutPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<TimeoutForm>({
    defaultValues: { minutes: String(DEFAULT_TIMEOUT) },
  });

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from('business_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .single();

      const value =
        data?.value && typeof data.value === 'number' && data.value > 0
          ? data.value
          : DEFAULT_TIMEOUT;

      reset({ minutes: String(value) });
      setLoading(false);
    }
    load();
  }, [reset]);

  async function onSubmit(formData: TimeoutForm) {
    const minutes = parseInt(formData.minutes, 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 480) {
      toast.error('Enter a value between 1 and 480 minutes');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('business_settings')
      .upsert(
        {
          key: SETTINGS_KEY,
          value: minutes as unknown,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (error) {
      toast.error('Failed to save', { description: error.message });
      setSaving(false);
      return;
    }

    toast.success('POS idle timeout updated');
    reset(formData);
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="POS Idle Timeout"
          description="Configure auto-logout for the POS terminal."
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
        title="POS Idle Timeout"
        description="Configure how long the POS stays active before automatically logging out."
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Auto-Logout Timer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              label="Idle Timeout"
              required
              error={errors.minutes?.message}
              description="The POS will automatically log out after this many minutes of inactivity. Default is 15 minutes."
              htmlFor="minutes"
            >
              <div className="relative max-w-xs">
                <Input
                  id="minutes"
                  type="number"
                  min="1"
                  max="480"
                  step="1"
                  placeholder="15"
                  {...register('minutes', {
                    required: 'Timeout is required',
                    validate: (value) => {
                      const num = parseInt(value, 10);
                      if (isNaN(num)) return 'Must be a number';
                      if (num < 1) return 'Minimum is 1 minute';
                      if (num > 480) return 'Maximum is 480 minutes (8 hours)';
                      return true;
                    },
                  })}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  min
                </span>
              </div>
            </FormField>

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
