'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';

interface MessagingSettings {
  messaging_ai_auto_reply: boolean;
  messaging_after_hours_enabled: boolean;
  messaging_after_hours_message: string;
  messaging_ai_instructions: string;
}

const DEFAULT_AFTER_HOURS_MESSAGE =
  'Thanks for reaching out to {business_name}! We\'re currently closed. Our business hours are {business_hours}. We\'ll get back to you as soon as we reopen. For immediate booking, visit: {booking_url}';

const SETTINGS_KEYS = [
  'messaging_ai_auto_reply',
  'messaging_after_hours_enabled',
  'messaging_after_hours_message',
  'messaging_ai_instructions',
] as const;

const DEFAULTS: MessagingSettings = {
  messaging_ai_auto_reply: false,
  messaging_after_hours_enabled: false,
  messaging_after_hours_message: DEFAULT_AFTER_HOURS_MESSAGE,
  messaging_ai_instructions: '',
};

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
          (loaded as Record<string, unknown>)[key] = row.value;
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
                When enabled, AI will automatically respond to new inbound messages from unknown numbers.
              </p>
            </div>
            <Switch
              checked={settings.messaging_ai_auto_reply}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, messaging_ai_auto_reply: checked }))
              }
            />
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
              checked={settings.messaging_after_hours_enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, messaging_after_hours_enabled: checked }))
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

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
