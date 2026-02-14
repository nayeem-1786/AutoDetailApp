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
import { ExternalLink, Star } from 'lucide-react';

interface ReviewSettings {
  google_review_url: string;
  yelp_review_url: string;
  google_review_rating: string;
  google_review_count: string;
  google_reviews_updated_at: string;
  yelp_review_rating: string;
  yelp_review_count: string;
}

const SETTINGS_KEYS = [
  'google_review_url',
  'yelp_review_url',
  'google_review_rating',
  'google_review_count',
  'google_reviews_updated_at',
  'yelp_review_rating',
  'yelp_review_count',
] as const;

const DEFAULTS: ReviewSettings = {
  google_review_url: '',
  yelp_review_url: '',
  google_review_rating: '',
  google_review_count: '',
  google_reviews_updated_at: '',
  yelp_review_rating: '',
  yelp_review_count: '',
};

/** Unwrap JSONB string value — handles both raw strings and JSON-encoded strings */
function unwrapValue(val: unknown): string {
  if (typeof val === 'string') return val;
  return String(val ?? '');
}

export default function ReviewsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingYelp, setSavingYelp] = useState(false);
  const [settings, setSettings] = useState<ReviewSettings>(DEFAULTS);
  const [initial, setInitial] = useState<ReviewSettings>(DEFAULTS);
  const [yelpRating, setYelpRating] = useState('');
  const [yelpCount, setYelpCount] = useState('');
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
      setYelpRating(loaded.yelp_review_rating);
      setYelpCount(loaded.yelp_review_count);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    const keysToSave = ['google_review_url', 'yelp_review_url'] as const;

    for (const key of keysToSave) {
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

  async function handleSaveYelp() {
    setSavingYelp(true);
    const supabase = createClient();

    const updates = [
      { key: 'yelp_review_rating', value: yelpRating },
      { key: 'yelp_review_count', value: yelpCount },
    ];

    for (const { key, value } of updates) {
      const { error } = await supabase
        .from('business_settings')
        .upsert(
          { key, value: value as unknown, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );

      if (error) {
        toast.error(`Failed to save ${key}`);
        setSavingYelp(false);
        return;
      }
    }

    toast.success('Yelp review data updated');
    setSettings((prev) => ({
      ...prev,
      yelp_review_rating: yelpRating,
      yelp_review_count: yelpCount,
    }));
    setInitial((prev) => ({
      ...prev,
      yelp_review_rating: yelpRating,
      yelp_review_count: yelpCount,
    }));
    setSavingYelp(false);
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

      {/* Card 2: Website Review Data */}
      <Card>
        <CardHeader>
          <CardTitle>Website Review Data</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            These values are displayed on the public website (trust bar, review cards, JSON-LD).
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Google Section (Read-Only) */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Google Reviews</h3>
              {settings.google_review_rating && settings.google_review_count ? (
                <>
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                    <span className="text-2xl font-bold text-gray-900">
                      {settings.google_review_rating}
                    </span>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-700">
                      {settings.google_review_count} reviews
                    </span>
                  </div>
                  {settings.google_reviews_updated_at ? (
                    <p className="text-xs text-gray-500">
                      Last updated:{' '}
                      {new Date(settings.google_reviews_updated_at).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">Auto-refreshes daily</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">No Google review data available</p>
              )}
            </div>

            {/* Yelp Section (Editable) */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Yelp Reviews (Manual)</h3>
              <FormField
                label="Rating"
                htmlFor="yelp_rating"
                description="Enter Yelp rating (0-5)"
              >
                <Input
                  id="yelp_rating"
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={yelpRating}
                  onChange={(e) => setYelpRating(e.target.value)}
                  placeholder="5.0"
                />
              </FormField>
              <FormField label="Review Count" htmlFor="yelp_count">
                <Input
                  id="yelp_count"
                  type="number"
                  min="0"
                  value={yelpCount}
                  onChange={(e) => setYelpCount(e.target.value)}
                  placeholder="84"
                />
              </FormField>
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveYelp}
                  disabled={savingYelp}
                  size="sm"
                >
                  {savingYelp ? 'Saving...' : 'Save Yelp Data'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Google Review Requests */}
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
