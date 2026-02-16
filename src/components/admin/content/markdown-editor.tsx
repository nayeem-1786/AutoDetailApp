'use client';

import { useState, useCallback } from 'react';
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  Link as LinkIcon,
  List,
  ListOrdered,
  Eye,
  EyeOff,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// ---------------------------------------------------------------------------
// Markdown Editor — textarea with toolbar + live preview
// ---------------------------------------------------------------------------

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  onAiImprove?: () => void;
  aiLoading?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Write content in markdown...',
  rows = 12,
  onAiImprove,
  aiLoading,
}: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false);

  const insertMarkdown = useCallback(
    (before: string, after: string = '') => {
      const textarea = document.querySelector(
        '[data-markdown-editor]'
      ) as HTMLTextAreaElement | null;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.substring(start, end);
      const newText =
        value.substring(0, start) +
        before +
        (selected || 'text') +
        after +
        value.substring(end);
      onChange(newText);

      // Restore cursor position after React re-renders
      requestAnimationFrame(() => {
        textarea.focus();
        const newPos = start + before.length + (selected || 'text').length;
        textarea.setSelectionRange(newPos, newPos);
      });
    },
    [value, onChange]
  );

  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <div className="rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1.5">
        <ToolbarButton
          icon={Bold}
          title="Bold"
          onClick={() => insertMarkdown('**', '**')}
        />
        <ToolbarButton
          icon={Italic}
          title="Italic"
          onClick={() => insertMarkdown('*', '*')}
        />
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <ToolbarButton
          icon={Heading2}
          title="Heading 2"
          onClick={() => insertMarkdown('\n## ', '\n')}
        />
        <ToolbarButton
          icon={Heading3}
          title="Heading 3"
          onClick={() => insertMarkdown('\n### ', '\n')}
        />
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <ToolbarButton
          icon={LinkIcon}
          title="Link"
          onClick={() => insertMarkdown('[', '](url)')}
        />
        <ToolbarButton
          icon={List}
          title="Bulleted List"
          onClick={() => insertMarkdown('\n- ', '')}
        />
        <ToolbarButton
          icon={ListOrdered}
          title="Numbered List"
          onClick={() => insertMarkdown('\n1. ', '')}
        />

        <div className="flex-1" />

        {onAiImprove && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAiImprove}
            disabled={aiLoading || !value.trim()}
            className="h-7 text-xs"
          >
            {aiLoading ? (
              <Spinner size="sm" className="mr-1" />
            ) : (
              <Wand2 className="mr-1 h-3 w-3" />
            )}
            Improve
          </Button>
        )}

        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="p-1.5 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title={showPreview ? 'Edit' : 'Preview'}
        >
          {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {/* Editor / Preview */}
      {showPreview ? (
        <div
          className="px-4 py-3 min-h-[200px] bg-white dark:bg-gray-900 prose prose-sm prose-gray dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(value) }}
        />
      ) : (
        <textarea
          data-markdown-editor
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="block w-full bg-white dark:bg-gray-900 px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-200 resize-y focus:outline-none"
        />
      )}

      {/* Footer */}
      <div className="flex items-center justify-end border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1">
        <span className="text-xs text-gray-400">
          {wordCount} word{wordCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar Button
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

// ---------------------------------------------------------------------------
// Simple Markdown Preview (mirrors public renderer)
// ---------------------------------------------------------------------------

function simpleMarkdownToHtml(md: string): string {
  let html = md;
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(
    /^(?:- (.+)\n?)+/gm,
    (match) => {
      const items = match.split('\n').filter((l) => l.startsWith('- ')).map((l) => `<li>${l.slice(2)}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
  );
  html = html.split('\n\n').map((block) => {
    const t = block.trim();
    if (!t || t.startsWith('<h') || t.startsWith('<ul') || t.startsWith('<ol')) return t;
    return `<p>${t.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  return html;
}
