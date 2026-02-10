'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';

interface ReviewSettings {
  google_review_url: string;
  yelp_review_url: string;
}

const SETTINGS_KEYS = ['google_review_url', 'yelp_review_url'] as const;

const DEFAULTS: ReviewSettings = {
  google_review_url: '',
  yelp_review_url: '',
};

/** Unwrap JSONB string value — handles both raw strings and JSON-encoded strings */
function unwrapValue(val: unknown): string {
  if (typeof val === 'string') return val;
  return String(val ?? '');
}

export default function ReviewsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ReviewSettings>(DEFAULTS);
  const [initial, setInitial] = useState<ReviewSettings>(DEFAULTS);
  const { enabled: reviewsEnabled, loading: flagLoading } = useFeatureFlag(
    FEATURE_FLAGS.GOOGLE_REVIEW_REQUESTS
  );

  const isDirty = JSON.stringify(settings) !== JSON.stringify(initial);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('business_settings')
        .select('key, value')
        .in('key', [...SETTINGS_KEYS]);

      if (error) {
        toast.error('Failed to load review settings');
        setLoading(false);
        return;
      }

      const loaded = { ...DEFAULTS };
      for (const row of data || []) {
        const key = row.key as keyof ReviewSettings;
        if (key in loaded) {
          loaded[key] = unwrapValue(row.value);
        }
      }

      setSettings(loaded);
      setInitial(loaded);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    for (const key of SETTINGS_KEYS) {
      const { error } = await supabase
        .from('business_settings')
        .upsert(
          { key, value: settings[key] as unknown, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );

      if (error) {
        toast.error(`Failed to save ${key}`);
        setSaving(false);
        return;
      }
    }

    toast.success('Review settings updated');
    setInitial({ ...settings });
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Reviews"
          description="Configure review request links and automation."
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
        title="Reviews"
        description="Configure review request links and automation."
      />

      {/* Card 1: Review Links */}
      <Card>
        <CardHeader>
          <CardTitle>Review Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <FormField
            label="Google Review URL"
            htmlFor="google_review_url"
            description="Direct link customers receive to leave a Google review."
          >
            <Input
              id="google_review_url"
              type="url"
              value={settings.google_review_url}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, google_review_url: e.target.value }))
              }
              placeholder="https://search.google.com/local/writereview?placeid=..."
            />
          </FormField>
          {settings.google_review_url && (
            <p className="text-xs text-gray-500">
              Preview:{' '}
              <a
                href={settings.google_review_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
              >
                {settings.google_review_url.length > 60
                  ? settings.google_review_url.slice(0, 60) + '...'
                  : settings.google_review_url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          )}

          <FormField
            label="Yelp Review URL"
            htmlFor="yelp_review_url"
            description="Direct link customers receive to leave a Yelp review."
          >
            <Input
              id="yelp_review_url"
              type="url"
              value={settings.yelp_review_url}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, yelp_review_url: e.target.value }))
              }
              placeholder="https://www.yelp.com/writeareview/biz/..."
            />
          </FormField>
          {settings.yelp_review_url && (
            <p className="text-xs text-gray-500">
              Preview:{' '}
              <a
                href={settings.yelp_review_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
              >
                {settings.yelp_review_url.length > 60
                  ? settings.yelp_review_url.slice(0, 60) + '...'
                  : settings.yelp_review_url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? 'Saving...' : 'Save Links'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Google Review Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Google Review Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Status:</span>
            {flagLoading ? (
              <Spinner size="sm" />
            ) : reviewsEnabled ? (
              <Badge variant="success">Enabled</Badge>
            ) : (
              <Badge variant="default">Disabled</Badge>
            )}
            <Link
              href="/admin/settings/feature-toggles"
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              Manage in Feature Toggles
            </Link>
          </div>

          <p className="text-sm text-gray-600">
            When enabled, customers automatically receive a review request SMS 30 minutes
            after their service is completed or product purchase. Customers receive at most
            one request per 30 days.
          </p>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm text-gray-600">
              Review request automations are managed as lifecycle rules.{' '}
              <Link
                href="/admin/marketing/automations"
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                View Automations
              </Link>{' '}
              to create or edit the review request rule.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
