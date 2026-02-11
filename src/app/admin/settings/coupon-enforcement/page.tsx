'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Info, Loader2 } from 'lucide-react';

type EnforcementMode = 'soft' | 'hard';

export default function CouponEnforcementPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<EnforcementMode>('soft');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('business_settings')
        .select('value')
        .eq('key', 'coupon_type_enforcement')
        .single();

      if (data?.value) {
        const val = typeof data.value === 'string' ? data.value : 'soft';
        setMode(val === 'hard' ? 'hard' : 'soft');
      }
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('business_settings')
        .update({ value: JSON.stringify(mode) })
        .eq('key', 'coupon_type_enforcement');

      if (error) throw error;
      toast.success('Enforcement mode saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coupon Enforcement"
        description="Control how customer type restrictions on coupons are enforced at the POS."
        action={
          <Button variant="outline" onClick={() => router.push('/admin/settings')}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Enforcement Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              When a coupon has a customer type restriction (e.g. &ldquo;Enthusiast Only&rdquo;, &ldquo;Professional Only&rdquo;, or &ldquo;Unknown Only&rdquo;)
              and a non-matching customer tries to use it, this setting controls what happens.
            </span>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setMode('soft')}
              className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-colors ${
                mode === 'soft'
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">Soft (Recommended)</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                The coupon is applied but a warning toast is shown to the cashier.
                This allows flexibility for edge cases while still communicating intent.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode('hard')}
              className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-colors ${
                mode === 'hard'
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">Hard</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                The coupon is rejected entirely if the customer type does not match.
                Use this for strict promotional compliance.
              </p>
            </button>
          </div>

          <div className="mt-6">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
