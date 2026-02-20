'use client';

import { useState, useRef } from 'react';
import { Wand2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { HtmlEditorToolbar } from '@/components/admin/html-editor-toolbar';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/utils/admin-fetch';

// ---------------------------------------------------------------------------
// PageHtmlEditor — HTML editor with shared toolbar, AI draft, and preview
// ---------------------------------------------------------------------------

interface PageHtmlEditorProps {
  value: string;
  onChange: (value: string) => void;
  pageTitle?: string;
  placeholder?: string;
  rows?: number;
}

export function PageHtmlEditor({
  value,
  onChange,
  pageTitle = '',
  placeholder = 'Write your page content in HTML...',
  rows = 16,
}: PageHtmlEditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState<'professional' | 'casual' | 'friendly'>('professional');
  const [aiLoading, setAiLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleAiDraft = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    setAiLoading(true);
    try {
      const res = await adminFetch('/api/admin/cms/pages/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          title: pageTitle,
          tone: aiTone,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }

      const { html } = await res.json();

      if (value.trim()) {
        const confirmed = confirm('Replace existing content with AI-generated draft?');
        if (!confirmed) {
          setAiLoading(false);
          return;
        }
      }

      onChange(html);
      setShowAiDialog(false);
      setAiPrompt('');
      toast.success('AI draft generated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
      {/* Shared toolbar + AI Draft button */}
      <div className="relative">
        <HtmlEditorToolbar
          textareaRef={textareaRef}
          value={value}
          onChange={onChange}
          onTogglePreview={() => setShowPreview(!showPreview)}
          isPreviewMode={showPreview}
          context="cms"
        />
        {/* AI Draft button — overlaid at right side of toolbar */}
        <div className="absolute right-10 top-1/2 -translate-y-1/2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAiDialog(!showAiDialog)}
            className="h-7 text-xs"
          >
            <Sparkles className="mr-1 h-3 w-3" />
            AI Draft
          </Button>
        </div>
      </div>

      {/* AI Draft Dialog */}
      {showAiDialog && (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-950/30 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-300">
            <Wand2 className="h-4 w-4" />
            AI Content Draft
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              What should this page be about?
            </label>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g., Our ceramic coating services, benefits, and why customers choose us..."
            />
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tone
              </label>
              <select
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value as typeof aiTone)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="friendly">Friendly</option>
              </select>
            </div>
            {pageTitle && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Page title: <span className="font-medium">{pageTitle}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleAiDraft}
              disabled={aiLoading || !aiPrompt.trim()}
            >
              {aiLoading ? (
                <>
                  <Spinner size="sm" className="mr-1" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-3 w-3" />
                  Generate
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAiDialog(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Editor / Preview */}
      {showPreview ? (
        <div className="bg-gray-900 text-gray-200 rounded-b-lg p-6">
          <div
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: value }}
          />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="block w-full bg-white dark:bg-gray-900 px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-200 resize-y focus:outline-none"
        />
      )}

      {/* Footer */}
      <div className="flex items-center justify-end border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1">
        <span className="text-xs text-gray-400">HTML</span>
      </div>
    </div>
  );
}
