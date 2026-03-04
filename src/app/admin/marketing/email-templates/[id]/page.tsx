'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { EmailBlockEditor } from '../_components/email-block-editor';
import { EmailPreview } from '../_components/email-preview';
import { VariableInserter } from '../_components/variable-inserter';
import { getVariablesForCategory } from '@/lib/email/variables';
import type { EmailTemplate, EmailLayout, EmailBlock, EmailTemplateCategory } from '@/lib/email/types';
import type { VariableDefinition } from '@/lib/email/variables';

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // Template state
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [layouts, setLayouts] = useState<EmailLayout[]>([]);
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editor state
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [layoutId, setLayoutId] = useState('');
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [category, setCategory] = useState<EmailTemplateCategory>('transactional');
  const [name, setName] = useState('');

  // Preview state
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Test send state
  const [testSendOpen, setTestSendOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);

  // Reset state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const variables: VariableDefinition[] = getVariablesForCategory(category);

  const isDirty = template
    ? JSON.stringify({ subject, previewText, layoutId, blocks, name }) !== initial
    : false;

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [templateRes, layoutsRes] = await Promise.all([
        adminFetch(`/api/admin/email-templates/${id}`, { cache: 'no-store' }),
        adminFetch('/api/admin/email-templates/layouts', { cache: 'no-store' }),
      ]);

      const templateJson = await templateRes.json();
      const layoutsJson = await layoutsRes.json();

      const data = templateJson.data as EmailTemplate;
      setTemplate(data);
      setSubject(data.subject);
      setPreviewText(data.preview_text || '');
      setLayoutId(data.layout_id);
      setBlocks(data.body_blocks || []);
      setCategory(data.category);
      setName(data.name);
      setLayouts(layoutsJson.data || []);

      setInitial(JSON.stringify({
        subject: data.subject,
        previewText: data.preview_text || '',
        layoutId: data.layout_id,
        blocks: data.body_blocks || [],
        name: data.name,
      }));
    } catch {
      toast.error('Failed to load template');
    } finally {
      setLoading(false);
    }
  }

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await adminFetch(`/api/admin/email-templates/${id}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body_blocks: blocks,
          layout_id: layoutId,
          subject,
          isMarketing: category === 'marketing',
        }),
      });
      const json = await res.json();
      setPreviewHtml(json.html || '');
    } catch {
      toast.error('Failed to render preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [id, blocks, layoutId, subject, category]);

  async function handleSave() {
    if (!template) return;
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/email-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject,
          preview_text: previewText,
          layout_id: layoutId,
          body_blocks: blocks,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed to save');
        return;
      }
      setTemplate(json.data);
      setInitial(JSON.stringify({ subject, previewText, layoutId, blocks, name }));
      toast.success('Template saved');
    } catch {
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSend() {
    if (!testEmail.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    setTestSending(true);
    try {
      // Save first if dirty
      if (isDirty) await handleSave();

      const res = await adminFetch(`/api/admin/email-templates/${id}/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed to send test');
        return;
      }
      toast.success(`Test email sent to ${testEmail}`);
      setTestSendOpen(false);
    } catch {
      toast.error('Failed to send test email');
    } finally {
      setTestSending(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await adminFetch(`/api/admin/email-templates/${id}/reset`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error || 'Failed to reset');
        return;
      }
      toast.success('Template reset to default');
      setResetOpen(false);
      loadData();
    } catch {
      toast.error('Failed to reset template');
    } finally {
      setResetting(false);
    }
  }

  if (loading || !template) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit Template" />
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit: ${template.name}`}
        description={template.is_system ? 'System template — edits are tracked and can be reset.' : undefined}
        action={
          <div className="flex items-center gap-2">
            {template.is_system && template.is_customized && (
              <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)}>
                Reset to Default
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push('/admin/marketing/email-templates')}>
              Back
            </Button>
          </div>
        }
      />

      {/* Template metadata badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="info">{template.category}</Badge>
        {template.is_system && <Badge variant="default">System</Badge>}
        {template.is_customized && <Badge variant="warning">Customized</Badge>}
        <Badge variant="secondary">v{template.version}</Badge>
        {template.template_key && (
          <Badge variant="secondary">Key: {template.template_key}</Badge>
        )}
      </div>

      {/* Settings row */}
      <Card>
        <CardHeader>
          <CardTitle>Template Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Template Name" htmlFor="tmpl-name">
              <Input
                id="tmpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={template.is_system}
              />
            </FormField>
            <FormField label="Layout" htmlFor="tmpl-layout">
              <Select
                id="tmpl-layout"
                value={layoutId}
                onChange={(e) => setLayoutId(e.target.value)}
              >
                {layouts.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            </FormField>
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="tmpl-subject" className="mb-1.5 block text-sm font-medium text-gray-700">Subject Line</label>
                <VariableInserter variables={variables} onInsert={(v) => setSubject(subject + v)} label="Variable" />
              </div>
              <Input
                id="tmpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject with {variables}"
              />
            </div>
            <FormField label="Preview Text" htmlFor="tmpl-preview" description="90-char inbox snippet">
              <Input
                id="tmpl-preview"
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                placeholder="Brief preview text shown in inbox..."
                maxLength={90}
              />
              <p className="mt-1 text-xs text-gray-400">{previewText.length}/90</p>
            </FormField>
          </div>
        </CardContent>
      </Card>

      {/* Block Editor */}
      <Card>
        <CardHeader>
          <CardTitle>Email Content</CardTitle>
        </CardHeader>
        <CardContent>
          <EmailBlockEditor
            blocks={blocks}
            onChange={setBlocks}
            variables={variables}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowPreview(!showPreview);
              if (!showPreview) loadPreview();
            }}
          >
            {showPreview ? 'Hide Preview' : 'Preview'}
          </Button>
          <Button variant="outline" onClick={() => setTestSendOpen(true)}>
            Send Test
          </Button>
        </div>
        <Button onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? <><Spinner size="sm" className="mr-2" /> Saving...</> : 'Save Template'}
        </Button>
      </div>

      {/* Preview Panel */}
      {showPreview && (
        <Card>
          <CardContent className="p-0">
            <div className="h-[700px]">
              <EmailPreview
                html={previewHtml}
                loading={previewLoading}
                onRefresh={loadPreview}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Send Dialog */}
      <Dialog open={testSendOpen} onOpenChange={setTestSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            Sends this template with sample variable values. Subject will be prefixed with [TEST].
          </p>
          <FormField label="Recipient Email" htmlFor="test-email">
            <Input
              id="test-email"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="your@email.com"
            />
          </FormField>
          {isDirty && (
            <p className="text-xs text-amber-600">
              You have unsaved changes. The template will be saved before sending.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestSendOpen(false)}>Cancel</Button>
            <Button onClick={handleTestSend} disabled={testSending || !testEmail}>
              {testSending ? <><Spinner size="sm" className="mr-2" /> Sending...</> : 'Send Test'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to Default</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            This will revert all customizations to this system template. Your edits will be lost. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReset} disabled={resetting}>
              {resetting ? <><Spinner size="sm" className="mr-2" /> Resetting...</> : 'Reset Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
