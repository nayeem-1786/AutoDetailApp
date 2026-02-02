'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useFeatureFlags, invalidateFeatureFlagCache } from '@/lib/hooks/use-feature-flag';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import type { FeatureFlag } from '@/lib/supabase/types';

export default function FeatureTogglesPage() {
  const { flags, loading, refresh } = useFeatureFlags();
  const [updating, setUpdating] = useState<string | null>(null);

  async function handleToggle(flag: FeatureFlag) {
    const supabase = createClient();
    const newEnabled = !flag.enabled;

    setUpdating(flag.id);

    const { error } = await supabase
      .from('feature_flags')
      .update({ enabled: newEnabled, updated_at: new Date().toISOString() })
      .eq('id', flag.id);

    if (error) {
      toast.error(`Failed to update "${flag.name}"`, {
        description: error.message,
      });
      setUpdating(null);
      return;
    }

    invalidateFeatureFlagCache();
    await refresh();

    toast.success(`"${flag.name}" ${newEnabled ? 'enabled' : 'disabled'}`);
    setUpdating(null);
  }

  const flagList = Object.values(flags).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Feature Toggles"
          description="Enable or disable platform features."
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
        title="Feature Toggles"
        description="Enable or disable platform features. Changes take effect immediately for all users."
      />

      {flagList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-gray-500">
              No feature flags found. Feature flags are defined in the database.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {flagList.map((flag) => (
            <Card key={flag.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-gray-900">
                      {flag.name}
                    </h3>
                    <Badge variant={flag.enabled ? 'success' : 'secondary'}>
                      {flag.enabled ? 'On' : 'Off'}
                    </Badge>
                  </div>
                  {flag.description && (
                    <p className="mt-0.5 text-sm text-gray-500">
                      {flag.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    Key: {flag.key}
                  </p>
                </div>
                <Switch
                  checked={flag.enabled}
                  onCheckedChange={() => handleToggle(flag)}
                  disabled={updating === flag.id}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
