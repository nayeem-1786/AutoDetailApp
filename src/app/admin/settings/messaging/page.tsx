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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { TogglePill } from '@/components/ui/toggle-pill';
import { getDefaultSystemPrompt } from '@/lib/services/messaging-ai-prompt';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
import { FEATURE_FLAGS } from '@/lib/utils/constants';

interface MessagingSettings {
  messaging_ai_unknown_enabled: string;
  messaging_ai_customers_enabled: string;
  messaging_ai_instructions: string;
  messaging_auto_close_hours: string;
  messaging_auto_archive_days: string;
  sms_business_phone_override: string;
  sms_test_phone_number: string;
  voice_agent_first_message_returning: string;
  voice_agent_first_message_new: string;
}

const SETTINGS_KEYS = [
  'messaging_ai_unknown_enabled',
  'messaging_ai_customers_enabled',
  'messaging_ai_instructions',
  'messaging_auto_close_hours',
  'messaging_auto_archive_days',
  'sms_business_phone_override',
  'sms_test_phone_number',
  'voice_agent_first_message_returning',
  'voice_agent_first_message_new',
] as const;

const DEFAULTS: MessagingSettings = {
  messaging_ai_unknown_enabled: 'true',
  messaging_ai_customers_enabled: 'false',
  messaging_ai_instructions: '',
  messaging_auto_close_hours: '48',
  messaging_auto_archive_days: '30',
  sms_business_phone_override: '',
  sms_test_phone_number: '',
  voice_agent_first_message_returning: '',
  voice_agent_first_message_new: '',
};

const VOICE_GREETING_DEFAULTS = {
  returning: 'Thanks for calling {{business_name}}. It looks like you\'ve called us before — is this {{first_name}}?',
  new: 'Good {{time_of_day}}! Thank you for calling {{business_name}}. This is Tom. Can I get your name before we get started?',
};

const VOICE_GREETING_VARIABLES = [
  { key: '{{business_name}}', label: 'Business Name' },
  { key: '{{customer_name}}', label: 'Full Name' },
  { key: '{{first_name}}', label: 'First Name' },
  { key: '{{time_of_day}}', label: 'Time of Day' },
];

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
  const { enabled: twoWaySmsEnabled } = useFeatureFlag(FEATURE_FLAGS.TWO_WAY_SMS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<MessagingSettings>(DEFAULTS);
  const [initial, setInitial] = useState<MessagingSettings>(DEFAULTS);
  const [resetPromptOpen, setResetPromptOpen] = useState(false);

  const isDirty = JSON.stringify(settings) !== JSON.stringify(initial);
  const aiEnabled = isEnabled(settings.messaging_ai_unknown_enabled) || isEnabled(settings.messaging_ai_customers_enabled);

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

      // Populate with default prompt if no saved instructions
      if (!loaded.messaging_ai_instructions.trim()) {
        loaded.messaging_ai_instructions = getDefaultSystemPrompt();
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
          description="Configure AI assistant and conversation settings."
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
        description="Configure AI assistant and conversation settings."
      />

      {!twoWaySmsEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            Two-Way SMS is currently disabled. These settings will take effect when the feature is enabled in{' '}
            <a href="/admin/settings/feature-toggles" className="font-medium text-amber-900 underline hover:text-amber-700">
              Feature Toggles
            </a>.
          </p>
        </div>
      )}

      {/* SMS Settings */}
      <Card>
        <CardHeader>
          <CardTitle>SMS Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            label="Business Phone Override"
            description="If set, replaces {business_phone} in all SMS templates. Leave empty to use the default business phone."
            htmlFor="sms_phone_override"
          >
            <input
              id="sms_phone_override"
              type="tel"
              placeholder="Default business phone"
              value={settings.sms_business_phone_override}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, sms_business_phone_override: e.target.value }))
              }
              className="h-9 w-full rounded-lg border border-gray-200 px-3 text-base text-gray-900 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200 sm:text-sm"
            />
          </FormField>
          <FormField
            label="SMS Test Phone Number"
            description="Template test messages will be sent to this number using real customer data."
            htmlFor="sms_test_phone"
          >
            <input
              id="sms_test_phone"
              type="tel"
              placeholder="+1XXXXXXXXXX"
              value={settings.sms_test_phone_number}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, sms_test_phone_number: e.target.value }))
              }
              className="h-9 w-full rounded-lg border border-gray-200 px-3 text-base text-gray-900 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200 sm:text-sm"
            />
          </FormField>
        </CardContent>
      </Card>

      {/* SMS Templates navigation card */}
      <a href="/admin/settings/messaging/sms-templates" className="block">
        <Card className="transition-colors hover:bg-gray-50">
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-sm font-semibold text-gray-900">SMS Templates</p>
              <p className="mt-0.5 text-sm text-gray-500">Customize the wording of automated text messages.</p>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">15 templates</span>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </CardContent>
        </Card>
      </a>

      {/* Voice Agent (ElevenLabs) */}
      <Card>
        <CardHeader>
          <CardTitle>Voice Agent (ElevenLabs)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Returning Customer Greeting */}
            <div>
              <p className="text-sm font-medium text-gray-900">
                Returning Customer
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                Recognized caller phones in.
              </p>
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="voice_returning"
                    checked={!settings.voice_agent_first_message_returning.trim()}
                    onChange={() => setSettings((prev) => ({ ...prev, voice_agent_first_message_returning: '' }))}
                    className="text-blue-600"
                  />
                  Use default
                </label>
                {!settings.voice_agent_first_message_returning.trim() && (
                  <p className="ml-6 text-xs text-gray-400 italic">{VOICE_GREETING_DEFAULTS.returning}</p>
                )}
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="voice_returning"
                    checked={!!settings.voice_agent_first_message_returning.trim()}
                    onChange={() => setSettings((prev) => ({ ...prev, voice_agent_first_message_returning: prev.voice_agent_first_message_returning.trim() || VOICE_GREETING_DEFAULTS.returning }))}
                    className="text-blue-600"
                  />
                  Custom
                </label>
                {!!settings.voice_agent_first_message_returning.trim() && (
                  <div className="ml-6 space-y-2">
                    <Textarea
                      rows={3}
                      className="font-mono text-xs"
                      value={settings.voice_agent_first_message_returning}
                      onChange={(e) => setSettings((prev) => ({ ...prev, voice_agent_first_message_returning: e.target.value }))}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {VOICE_GREETING_VARIABLES.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => setSettings((prev) => ({ ...prev, voice_agent_first_message_returning: prev.voice_agent_first_message_returning + v.key }))}
                          className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                          {v.key}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* New Caller Greeting */}
            <div>
              <p className="text-sm font-medium text-gray-900">
                New Caller
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                Unknown number calls.
              </p>
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="voice_new"
                    checked={!settings.voice_agent_first_message_new.trim()}
                    onChange={() => setSettings((prev) => ({ ...prev, voice_agent_first_message_new: '' }))}
                    className="text-blue-600"
                  />
                  Use default
                </label>
                {!settings.voice_agent_first_message_new.trim() && (
                  <p className="ml-6 text-xs text-gray-400 italic">{VOICE_GREETING_DEFAULTS.new}</p>
                )}
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="voice_new"
                    checked={!!settings.voice_agent_first_message_new.trim()}
                    onChange={() => setSettings((prev) => ({ ...prev, voice_agent_first_message_new: prev.voice_agent_first_message_new.trim() || VOICE_GREETING_DEFAULTS.new }))}
                    className="text-blue-600"
                  />
                  Custom
                </label>
                {!!settings.voice_agent_first_message_new.trim() && (
                  <div className="ml-6 space-y-2">
                    <Textarea
                      rows={3}
                      className="font-mono text-xs"
                      value={settings.voice_agent_first_message_new}
                      onChange={(e) => setSettings((prev) => ({ ...prev, voice_agent_first_message_new: e.target.value }))}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {VOICE_GREETING_VARIABLES.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => setSettings((prev) => ({ ...prev, voice_agent_first_message_new: prev.voice_agent_first_message_new + v.key }))}
                          className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                          {v.key}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Assistant */}
      <Card>
        <CardHeader>
          <CardTitle>AI Assistant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Enable AI Assistant
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                When enabled, AI responds to inbound messages automatically.
              </p>
            </div>
            <Switch
              checked={aiEnabled}
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

          {aiEnabled && (
            <>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  During Business Hours
                </p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Choose which messages get AI replies during open hours.
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

              <div>
                <p className="text-sm font-medium text-gray-900">
                  After Hours
                </p>
                <p className="mt-0.5 text-sm text-gray-500">
                  AI automatically handles all inbound messages when the business is closed.
                  Business hours are configured in{' '}
                  <a href="/admin/settings/business-profile" className="text-blue-600 hover:text-blue-800 hover:underline">
                    Business Profile
                  </a>.
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-900">
                  AI Prompt
                </p>
                <Textarea
                  id="ai_instructions"
                  rows={8}
                  className="mt-2 font-mono text-xs"
                  value={settings.messaging_ai_instructions}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, messaging_ai_instructions: e.target.value }))
                  }
                />
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Behavioral rules for the AI. Service catalog and business info are appended automatically.
                  </p>
                  <button
                    type="button"
                    onClick={() => setResetPromptOpen(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap ml-4"
                  >
                    Apply Standard Template
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Conversation Lifecycle */}
      <Card>
        <CardHeader>
          <CardTitle>Conversation Lifecycle</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              label="Auto-close after"
              description="Close open conversations with no activity after this period."
              htmlFor="auto_close_hours"
            >
              <Select
                id="auto_close_hours"
                value={settings.messaging_auto_close_hours}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, messaging_auto_close_hours: e.target.value }))
                }
              >
                {AUTO_CLOSE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Auto-archive after"
              description="Archive closed conversations after this period."
              htmlFor="auto_archive_days"
            >
              <Select
                id="auto_archive_days"
                value={settings.messaging_auto_archive_days}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, messaging_auto_archive_days: e.target.value }))
                }
              >
                {AUTO_ARCHIVE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <ConfirmDialog
        open={resetPromptOpen}
        onOpenChange={setResetPromptOpen}
        title="Reset to Standard Template"
        description="Your custom instructions will be replaced with the default AI prompt template."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={() => {
          setSettings((prev) => ({
            ...prev,
            messaging_ai_instructions: getDefaultSystemPrompt(),
          }));
          setResetPromptOpen(false);
        }}
      />
    </div>
  );
}
