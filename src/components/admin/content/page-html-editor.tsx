'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  Link as LinkIcon,
  List,
  ListOrdered,
  Image as ImageIcon,
  Minus,
  Eye,
  EyeOff,
  Wand2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/utils/admin-fetch';

// ---------------------------------------------------------------------------
// PageHtmlEditor — HTML editor with toolbar, AI draft, and preview
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

  const insertHtml = useCallback(
    (before: string, after: string = '') => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.substring(start, end);
      const insertion = selected || 'text';
      const newText =
        value.substring(0, start) + before + insertion + after + value.substring(end);
      onChange(newText);

      requestAnimationFrame(() => {
        textarea.focus();
        const newPos = start + before.length + insertion.length;
        textarea.setSelectionRange(newPos, newPos);
      });
    },
    [value, onChange]
  );

  const insertBlock = useCallback(
    (html: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const newText = value.substring(0, start) + html + value.substring(start);
      onChange(newText);

      requestAnimationFrame(() => {
        textarea.focus();
        const newPos = start + html.length;
        textarea.setSelectionRange(newPos, newPos);
      });
    },
    [value, onChange]
  );

  const handleLink = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end) || 'Link text';
    const url = prompt('Enter URL:', 'https://');
    if (!url) return;
    const html = `<a href="${url}" class="text-lime hover:underline">${selected}</a>`;
    const newText = value.substring(0, start) + html + value.substring(end);
    onChange(newText);
  }, [value, onChange]);

  const handleImage = useCallback(() => {
    const url = prompt('Image URL:', 'https://');
    if (!url) return;
    const alt = prompt('Alt text:', '') || '';
    insertBlock(`\n<img src="${url}" alt="${alt}" class="rounded-lg my-6" />\n`);
  }, [insertBlock]);

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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1.5">
        <ToolbarButton icon={Bold} title="Bold" onClick={() => insertHtml('<strong>', '</strong>')} />
        <ToolbarButton icon={Italic} title="Italic" onClick={() => insertHtml('<em>', '</em>')} />
        <Divider />
        <ToolbarButton
          icon={Heading2}
          title="Heading 2"
          onClick={() => insertHtml('\n<h2 class="text-2xl font-semibold mb-3">', '</h2>\n')}
        />
        <ToolbarButton
          icon={Heading3}
          title="Heading 3"
          onClick={() => insertHtml('\n<h3 class="text-xl font-semibold mb-2">', '</h3>\n')}
        />
        <Divider />
        <ToolbarButton icon={LinkIcon} title="Link" onClick={handleLink} />
        <ToolbarButton
          icon={List}
          title="Unordered List"
          onClick={() =>
            insertBlock('\n<ul class="list-disc pl-6 space-y-1">\n  <li>Item</li>\n</ul>\n')
          }
        />
        <ToolbarButton
          icon={ListOrdered}
          title="Ordered List"
          onClick={() =>
            insertBlock('\n<ol class="list-decimal pl-6 space-y-1">\n  <li>Item</li>\n</ol>\n')
          }
        />
        <ToolbarButton icon={ImageIcon} title="Image" onClick={handleImage} />
        <ToolbarButton
          icon={Minus}
          title="Horizontal Rule"
          onClick={() => insertBlock('\n<hr class="border-site-border my-8" />\n')}
        />

        <div className="flex-1" />

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

        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="p-1.5 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title={showPreview ? 'Edit' : 'Preview'}
        >
          {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
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

// ---------------------------------------------------------------------------
// Toolbar helpers
// ---------------------------------------------------------------------------

function ToolbarButton({
  icon: Icon,
  title,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />;
}
