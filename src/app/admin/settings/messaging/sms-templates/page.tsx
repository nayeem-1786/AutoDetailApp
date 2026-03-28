'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { SlideOver } from '@/components/ui/slide-over';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { VariableInserter } from '@/app/admin/marketing/email-templates/_components/variable-inserter';
import { SMS_TEMPLATE_VARIABLES } from '@/lib/sms/sms-template-variables';
import { useUnsavedChanges } from '@/lib/hooks/use-unsaved-changes';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { toast } from 'sonner';
import { renderTemplate } from '@/lib/utils/template';
import type { VariableDefinition } from '@/lib/email/variables';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SmsTemplate {
  id: string;
  slug: string;
  name: string;
  category: string;
  body_template: string;
  default_body: string;
  variables: Array<{ key: string; description: string; required: boolean }>;
  is_active: boolean;
  can_silence: boolean;
  recipient_type: 'customer' | 'staff' | 'detailer';
  recipient_phones: string[] | null;
  updated_at: string;
}

const CATEGORY_ORDER = ['booking', 'quote', 'reminder', 'transactional', 'system'];
const CATEGORY_LABELS: Record<string, string> = {
  booking: 'Booking',
  quote: 'Quote',
  reminder: 'Reminder',
  transactional: 'Transactional',
  system: 'System',
};

const RECIPIENT_BADGES: Record<string, { label: string; className: string }> = {
  customer: { label: 'Customer', className: 'bg-blue-50 text-blue-700' },
  staff: { label: 'Staff', className: 'bg-amber-50 text-amber-700' },
  detailer: { label: 'Detailer', className: 'bg-green-50 text-green-700' },
};

// ---------------------------------------------------------------------------
// SMS segment counting
// ---------------------------------------------------------------------------

function countSegments(text: string): { chars: number; segments: number } {
  const chars = text.length;
  if (chars <= 160) return { chars, segments: 1 };
  return { chars, segments: Math.ceil(chars / 153) };
}

function buildSampleVars(variables: Array<{ key: string; description: string; required: boolean }>, slug: string): Record<string, string> {
  const defs = SMS_TEMPLATE_VARIABLES[slug] ?? [];
  const result: Record<string, string> = {};
  for (const v of variables) {
    const def = defs.find((d) => d.key === v.key);
    const sample = def?.sample;
    if (sample && !sample.startsWith('[')) {
      result[v.key] = sample;
    } else if (v.key === 'business_name') {
      result[v.key] = 'Smart Details Auto Spa';
    } else if (v.key === 'business_phone') {
      result[v.key] = '(310) 756-4789';
    } else if (v.key === 'business_address') {
      result[v.key] = '2500 PCH, Lomita, CA';
    } else {
      result[v.key] = `[${v.description}]`;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SmsTemplatesPage() {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSlug, setEditSlug] = useState<string | null>(null);

  // Slide-over editor state
  const [editBody, setEditBody] = useState('');
  const [editPhones, setEditPhones] = useState<string[]>([]);
  const [phoneInput, setPhoneInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirmSilenceSlug, setConfirmSilenceSlug] = useState<string | null>(null);

  // Loaded values for dirty detection
  const [loadedBody, setLoadedBody] = useState('');
  const [loadedPhones, setLoadedPhones] = useState<string[]>([]);

  // Cursor position for variable insertion
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef<number | null>(null);

  const editTemplate = templates.find((t) => t.slug === editSlug) ?? null;
  const isDirty = editBody !== loadedBody || JSON.stringify(editPhones) !== JSON.stringify(loadedPhones);
  useUnsavedChanges(isDirty);

  // Fetch templates
  useEffect(() => {
    async function load() {
      try {
        const res = await adminFetch('/api/admin/sms-templates');
        const data = await res.json();
        if (res.ok) setTemplates(data.templates);
        else toast.error('Failed to load SMS templates');
      } catch {
        toast.error('Failed to load SMS templates');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Open slide-over
  const openEditor = useCallback((t: SmsTemplate) => {
    if (isDirty && editSlug) {
      if (!window.confirm('You have unsaved changes. Discard?')) return;
    }
    setEditSlug(t.slug);
    setEditBody(t.body_template);
    setLoadedBody(t.body_template);
    setEditPhones(t.recipient_phones ?? []);
    setLoadedPhones(t.recipient_phones ?? []);
    setPhoneInput('');
    cursorPosRef.current = null;
  }, [isDirty, editSlug]);

  const closeEditor = useCallback(() => {
    if (isDirty) {
      if (!window.confirm('You have unsaved changes. Discard?')) return;
    }
    setEditSlug(null);
  }, [isDirty]);

  // Toggle is_active
  async function handleToggle(t: SmsTemplate, newValue: boolean) {
    // For can_silence=false templates, show confirmation before disabling
    if (!newValue && !t.can_silence) {
      setConfirmSilenceSlug(t.slug);
      return;
    }
    await performToggle(t.slug, newValue, false);
  }

  async function performToggle(slug: string, newValue: boolean, confirmSilence: boolean) {
    // Optimistic update
    setTemplates((prev) => prev.map((t) => t.slug === slug ? { ...t, is_active: newValue } : t));

    try {
      const body: Record<string, unknown> = { is_active: newValue };
      if (confirmSilence) body.confirm_silence = true;

      const res = await adminFetch(`/api/admin/sms-templates/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }

      toast.success(newValue ? 'Template enabled.' : 'Template disabled — messages will not be sent.');
    } catch (err) {
      // Rollback
      setTemplates((prev) => prev.map((t) => t.slug === slug ? { ...t, is_active: !newValue } : t));
      toast.error(err instanceof Error ? err.message : 'Failed to toggle template');
    }
  }

  // Save template
  async function handleSave() {
    if (!editTemplate) return;

    // Client-side required variable validation
    const missing = editTemplate.variables
      .filter((v) => v.required && !editBody.includes(`{${v.key}}`))
      .map((v) => v.key);

    if (missing.length > 0) {
      toast.error(`Missing required variables: ${missing.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = { body_template: editBody };
      if (editTemplate.recipient_type === 'staff') {
        payload.recipient_phones = editPhones;
      }

      const res = await adminFetch(`/api/admin/sms-templates/${editTemplate.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.missing) {
          toast.error(`Missing required variables: ${data.missing.join(', ')}`);
        } else {
          toast.error(data.error || 'Failed to save');
        }
        return;
      }

      const updated = await res.json();
      setTemplates((prev) => prev.map((t) => t.slug === updated.slug ? updated : t));
      setLoadedBody(updated.body_template);
      setLoadedPhones(updated.recipient_phones ?? []);
      toast.success('Template saved. Changes take effect within 60 seconds.');
    } catch {
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  // Reset to default
  async function handleReset() {
    if (!editTemplate) return;
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/sms-templates/${editTemplate.slug}/reset`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Reset failed');
      const updated = await res.json();
      setTemplates((prev) => prev.map((t) => t.slug === updated.slug ? updated : t));
      setEditBody(updated.body_template);
      setLoadedBody(updated.body_template);
      toast.success('Template reset to default.');
    } catch {
      toast.error('Failed to reset template');
    } finally {
      setSaving(false);
    }
  }

  // Send test
  async function handleSendTest() {
    if (!editTemplate) return;
    setTesting(true);
    try {
      const res = await adminFetch(`/api/admin/sms-templates/${editTemplate.slug}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Test send failed');
        return;
      }
      toast.success(`Test sent to ${data.phone}`);
    } catch {
      toast.error('Test send failed');
    } finally {
      setTesting(false);
    }
  }

  // Add phone to recipient list
  function addPhone() {
    const phone = phoneInput.trim();
    if (!phone) return;
    if (!/^\+[1-9]\d{9,14}$/.test(phone)) {
      toast.error('Invalid phone number. Use E.164 format: +1XXXXXXXXXX');
      return;
    }
    if (editPhones.includes(phone)) {
      toast.error('Phone number already added');
      return;
    }
    setEditPhones((prev) => [...prev, phone]);
    setPhoneInput('');
  }

  // Variable insertion
  function insertVariable(variable: string) {
    const pos = cursorPosRef.current ?? editBody.length;
    const newBody = editBody.slice(0, pos) + variable + editBody.slice(pos);
    setEditBody(newBody);
    // Move cursor after inserted variable
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = pos + variable.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.focus();
      }
    }, 0);
  }

  // Preview rendering
  const sampleVars = editTemplate ? buildSampleVars(editTemplate.variables, editTemplate.slug) : {};
  const previewText = editTemplate ? renderTemplate(editBody, sampleVars) : '';
  const { chars, segments } = countSegments(previewText);

  // Build variable definitions for the inserter (add * for required)
  const variableDefs: VariableDefinition[] = editTemplate
    ? editTemplate.variables.map((v) => ({
        key: v.key,
        description: v.required ? `${v.description} *` : v.description,
        sample: SMS_TEMPLATE_VARIABLES[editTemplate.slug]?.find((d) => d.key === v.key)?.sample ?? '',
      }))
    : [];

  // Group templates by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] || cat,
    templates: templates.filter((t) => t.category === cat),
  })).filter((g) => g.templates.length > 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="SMS Templates" description="Settings > Messaging > SMS Templates" />
        <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS Templates"
        description="Customize the wording of automated text messages."
      />

      {/* Template list grouped by category */}
      {grouped.map((group) => (
        <div key={group.category}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {group.label}
            </h3>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              {group.templates.length}
            </span>
          </div>
          <Card>
            <CardContent className="divide-y divide-gray-100 p-0">
              {group.templates.map((t) => (
                <div
                  key={t.slug}
                  className="flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-gray-50"
                  onClick={() => openEditor(t)}
                >
                  <div onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={t.is_active}
                      onCheckedChange={(checked) => handleToggle(t, checked)}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{t.name}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {t.body_template}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RECIPIENT_BADGES[t.recipient_type]?.className || ''}`}>
                      {RECIPIENT_BADGES[t.recipient_type]?.label || t.recipient_type}
                    </span>
                    {t.recipient_type === 'staff' && (
                      <span className="text-xs text-gray-400">
                        {t.recipient_phones?.length ? `${t.recipient_phones.length} recipient${t.recipient_phones.length > 1 ? 's' : ''}` : 'Default'}
                      </span>
                    )}
                    <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ))}

      {/* Slide-over editor */}
      <SlideOver open={!!editSlug} onClose={closeEditor} title={editTemplate?.name || ''} width="xl">
        {editTemplate && (
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="mb-4">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${RECIPIENT_BADGES[editTemplate.recipient_type]?.className || ''}`}>
                {RECIPIENT_BADGES[editTemplate.recipient_type]?.label}
              </span>
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                {CATEGORY_LABELS[editTemplate.category]}
              </span>
            </div>

            {/* Recipient section (staff only) */}
            {editTemplate.recipient_type === 'staff' && (
              <div className="mb-4 rounded-lg border border-gray-200 p-3">
                <p className="mb-2 text-xs font-medium text-gray-700">Recipient Phone Numbers</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {editPhones.map((phone) => (
                    <span key={phone} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {phone}
                      <button
                        type="button"
                        onClick={() => setEditPhones((prev) => prev.filter((p) => p !== phone))}
                        className="ml-0.5 text-gray-400 hover:text-gray-600"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPhone())}
                    placeholder="Add phone number..."
                    className="h-8 flex-1 rounded border border-gray-200 px-2 text-base text-gray-900 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200 sm:text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={addPhone}>Add</Button>
                </div>
                {editPhones.length === 0 && (
                  <p className="mt-1.5 text-xs text-gray-400">No numbers configured — defaults to business phone.</p>
                )}
              </div>
            )}

            {editTemplate.recipient_type === 'customer' && (
              <p className="mb-3 text-xs text-gray-500">Sent to the customer&apos;s phone number.</p>
            )}
            {editTemplate.recipient_type === 'detailer' && (
              <p className="mb-3 text-xs text-gray-500">Sent to the assigned detailer&apos;s phone number.</p>
            )}

            {/* Body editor */}
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">Message</label>
              <VariableInserter variables={variableDefs} onInsert={insertVariable} />
            </div>
            <textarea
              ref={textareaRef}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              onBlur={(e) => { cursorPosRef.current = e.target.selectionStart; }}
              rows={6}
              className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 font-mono text-base text-gray-900 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200 sm:text-sm"
            />

            {/* Reminder note */}
            {editTemplate.category === 'reminder' && (
              <div className="mt-2 rounded border border-blue-100 bg-blue-50 px-3 py-2">
                <p className="text-xs text-blue-700">Reminder messages automatically include opt-out text (Reply STOP to unsubscribe).</p>
              </div>
            )}

            {/* Stats */}
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
              <span>{chars} chars</span>
              <span className={segments > 1 ? 'font-medium text-amber-600' : ''}>
                {segments} SMS{segments > 1 ? ` — This message will be split into ${segments} texts` : ''}
              </span>
            </div>

            {/* Preview */}
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-700">Preview</label>
              <div className="max-w-sm rounded-2xl bg-gray-100 px-4 py-3">
                <p className="whitespace-pre-wrap text-sm text-gray-800">{previewText || '(empty)'}</p>
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Actions (sticky bottom) */}
            <div className="sticky bottom-0 -mx-6 border-t border-gray-200 bg-white px-6 py-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendTest}
                  disabled={testing}
                >
                  {testing ? <Spinner size="sm" /> : 'Send Test'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (window.confirm('Reset this template to the original default? Your customizations will be lost.')) {
                      handleReset();
                    }
                  }}
                  disabled={saving}
                  className="text-red-600 hover:text-red-700"
                >
                  Reset to Default
                </Button>
                <div className="flex-1" />
                <Button onClick={handleSave} disabled={saving || !isDirty}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SlideOver>

      {/* Confirm dialog for can_silence=false templates */}
      <ConfirmDialog
        open={!!confirmSilenceSlug}
        onOpenChange={(open) => { if (!open) setConfirmSilenceSlug(null); }}
        title="Disable Template?"
        description="Customers will NOT receive a message for this event. Are you sure?"
        confirmLabel="Disable"
        variant="destructive"
        onConfirm={() => {
          if (confirmSilenceSlug) {
            performToggle(confirmSilenceSlug, false, true);
            setConfirmSilenceSlug(null);
          }
        }}
      />
    </div>
  );
}
