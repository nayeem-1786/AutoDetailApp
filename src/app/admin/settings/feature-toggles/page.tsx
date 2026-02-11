'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useFeatureFlags, invalidateFeatureFlagCache } from '@/lib/hooks/use-feature-flag';
import { useFeatureFlagContext } from '@/lib/hooks/feature-flag-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import type { FeatureFlag } from '@/lib/supabase/types';

// Category display order
const CATEGORY_ORDER = [
  'Core POS',
  'Marketing',
  'Communication',
  'Booking',
  'Integrations',
  'Operations',
  'Future',
];

export default function FeatureTogglesPage() {
  const { flags, loading, refresh } = useFeatureFlags();
  const flagContext = useFeatureFlagContext();
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
    // Update the provider context so sidebar reacts immediately
    await flagContext?.refreshFlags();

    toast.success(`"${flag.name}" ${newEnabled ? 'enabled' : 'disabled'}`);
    setUpdating(null);
  }

  // Group flags by category
  const flagList = Object.values(flags);
  const grouped: Record<string, FeatureFlag[]> = {};
  for (const flag of flagList) {
    const cat = flag.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(flag);
  }

  // Sort flags within each category by name
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Order categories
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

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
        <div className="space-y-8">
          {sortedCategories.map((category) => {
            const isFuture = category === 'Future';
            return (
              <div key={category}>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-900">
                    {category}
                  </h2>
                  {isFuture && (
                    <Badge variant="secondary">Coming Soon</Badge>
                  )}
                </div>
                <div className="space-y-3">
                  {grouped[category].map((flag) => (
                    <Card
                      key={flag.id}
                      className={isFuture ? 'opacity-60' : ''}
                    >
                      <CardContent className="flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-gray-900">
                              {flag.name}
                            </h3>
                            <Badge
                              variant={flag.enabled ? 'success' : 'secondary'}
                            >
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
