'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { TogglePill } from '@/components/ui/toggle-pill';

interface MessagingSettings {
  messaging_ai_unknown_enabled: string;
  messaging_ai_customers_enabled: string;
  messaging_after_hours_enabled: string;
  messaging_after_hours_message: string;
  messaging_ai_instructions: string;
  messaging_auto_close_hours: string;
  messaging_auto_archive_days: string;
}

const DEFAULT_AFTER_HOURS_MESSAGE =
  'Thanks for reaching out to {business_name}! We\'re currently closed. Our business hours are {business_hours}. We\'ll get back to you as soon as we reopen. For immediate booking, visit: {booking_url}';

const SETTINGS_KEYS = [
  'messaging_ai_unknown_enabled',
  'messaging_ai_customers_enabled',
  'messaging_after_hours_enabled',
  'messaging_after_hours_message',
  'messaging_ai_instructions',
  'messaging_auto_close_hours',
  'messaging_auto_archive_days',
] as const;

const DEFAULTS: MessagingSettings = {
  messaging_ai_unknown_enabled: 'true',
  messaging_ai_customers_enabled: 'false',
  messaging_after_hours_enabled: 'false',
  messaging_after_hours_message: DEFAULT_AFTER_HOURS_MESSAGE,
  messaging_ai_instructions: '',
  messaging_auto_close_hours: '48',
  messaging_auto_archive_days: '30',
};

const AUTO_CLOSE_OPTIONS = [
  { value: '24', label: '24 hours' },
  { value: '48', label: '48 hours' },
  { value: '72', label: '72 hours' },
  { value: '168', label: '1 week' },
  { value: '336', label: '2 weeks' },
  { value: '0', label: 'Never' },
];

const AUTO_ARCHIVE_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '0', label: 'Never' },
];

/** Normalize DB value to string — handles booleans, strings, and JSON-encoded strings */
function toStringValue(val: unknown): string {
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'string') return val;
  return String(val ?? '');
}

/** Check if a setting string is "true" (handles boolean true and string "true") */
function isEnabled(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  return String(val) === 'true';
}

export default function MessagingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<MessagingSettings>(DEFAULTS);
  const [initial, setInitial] = useState<MessagingSettings>(DEFAULTS);

  const isDirty = JSON.stringify(settings) !== JSON.stringify(initial);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('business_settings')
        .select('key, value')
        .in('key', [...SETTINGS_KEYS]);

      if (error) {
        toast.error('Failed to load messaging settings', {
          description: error.message,
        });
        setLoading(false);
        return;
      }

      const loaded = { ...DEFAULTS };
      for (const row of data || []) {
        const key = row.key as keyof MessagingSettings;
        if (key in loaded) {
          loaded[key] = toStringValue(row.value);
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

    const entries = SETTINGS_KEYS.map((key) => ({
      key,
      value: settings[key] as unknown,
      updated_at: new Date().toISOString(),
    }));

    for (const entry of entries) {
      const { error } = await supabase
        .from('business_settings')
        .upsert(entry, { onConflict: 'key' });

      if (error) {
        toast.error(`Failed to save ${entry.key}`, {
          description: error.message,
        });
        setSaving(false);
        return;
      }
    }

    toast.success('Messaging settings updated');
    setInitial({ ...settings });
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Messaging"
          description="Configure AI auto-replies and after-hours messaging."
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
        title="Messaging"
        description="Configure AI auto-replies and after-hours messaging."
      />

      {/* AI Auto-Reply */}
      <Card>
        <CardHeader>
          <CardTitle>AI Auto-Reply</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Enable AI Auto-Reply
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                Automatically reply to incoming messages using AI.
              </p>
            </div>
            <Switch
              checked={isEnabled(settings.messaging_ai_unknown_enabled) || isEnabled(settings.messaging_ai_customers_enabled)}
              onCheckedChange={(checked) => {
                if (checked) {
                  setSettings((prev) => ({
                    ...prev,
                    messaging_ai_unknown_enabled: 'true',
                    messaging_ai_customers_enabled: 'false',
                  }));
                } else {
                  setSettings((prev) => ({
                    ...prev,
                    messaging_ai_unknown_enabled: 'false',
                    messaging_ai_customers_enabled: 'false',
                  }));
                }
              }}
            />
          </div>

          {(isEnabled(settings.messaging_ai_unknown_enabled) || isEnabled(settings.messaging_ai_customers_enabled)) && (
            <>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Audience
                </p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Choose which message senders get AI-powered auto-replies. Both can be enabled independently.
                </p>
                <div className="mt-3 flex gap-2">
                  <TogglePill
                    label="Unknown"
                    active={isEnabled(settings.messaging_ai_unknown_enabled)}
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        messaging_ai_unknown_enabled: isEnabled(prev.messaging_ai_unknown_enabled) ? 'false' : 'true',
                      }))
                    }
                    activeClassName="bg-purple-100 text-purple-700"
                  />
                  <TogglePill
                    label="Customers"
                    active={isEnabled(settings.messaging_ai_customers_enabled)}
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        messaging_ai_customers_enabled: isEnabled(prev.messaging_ai_customers_enabled) ? 'false' : 'true',
                      }))
                    }
                    activeClassName="bg-blue-100 text-blue-700"
                  />
                </div>
              </div>

              <FormField
                label="Additional AI Instructions"
                description="Custom instructions for the AI when composing replies. For example: tone, topics to avoid, or specific information to include."
                htmlFor="ai_instructions"
              >
                <Textarea
                  id="ai_instructions"
                  rows={4}
                  placeholder="e.g., Always be friendly and professional. Mention our ceramic coating special when relevant."
                  value={settings.messaging_ai_instructions}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, messaging_ai_instructions: e.target.value }))
                  }
                />
              </FormField>
            </>
          )}
        </CardContent>
      </Card>

      {/* After-Hours Auto-Reply */}
      <Card>
        <CardHeader>
          <CardTitle>After-Hours Auto-Reply</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Enable After-Hours Auto-Reply
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                Send an automatic reply when messages arrive outside of business hours.
                Business hours are configured in{' '}
                <a href="/admin/settings/business-profile" className="text-blue-600 hover:text-blue-800 hover:underline">
                  Business Profile
                </a>.
              </p>
            </div>
            <Switch
              checked={isEnabled(settings.messaging_after_hours_enabled)}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, messaging_after_hours_enabled: checked ? 'true' : 'false' }))
              }
            />
          </div>

          <FormField
            label="After-Hours Message"
            description="Template sent when a message arrives outside business hours. Available variables: {business_name}, {business_hours}, {booking_url}"
            htmlFor="after_hours_message"
          >
            <Textarea
              id="after_hours_message"
              rows={4}
              placeholder={DEFAULT_AFTER_HOURS_MESSAGE}
              value={settings.messaging_after_hours_message}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, messaging_after_hours_message: e.target.value }))
              }
            />
          </FormField>
        </CardContent>
      </Card>

      {/* Conversation Lifecycle */}
      <Card>
        <CardHeader>
          <CardTitle>Conversation Lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <FormField
            label="Auto-Close Timer"
            description="Automatically close open conversations with no activity after this period."
            htmlFor="auto_close_hours"
          >
            <Select
              id="auto_close_hours"
              value={settings.messaging_auto_close_hours}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, messaging_auto_close_hours: e.target.value }))
              }
              className="w-full sm:w-64"
            >
              {AUTO_CLOSE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            label="Auto-Archive Timer"
            description="Automatically archive closed conversations after this period."
            htmlFor="auto_archive_days"
          >
            <Select
              id="auto_archive_days"
              value={settings.messaging_auto_archive_days}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, messaging_auto_archive_days: e.target.value }))
              }
              className="w-full sm:w-64"
            >
              {AUTO_ARCHIVE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
