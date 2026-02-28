'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { adminFetch } from '@/lib/utils/admin-fetch';
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Wand2,
  Eye,
  EyeOff,
  FileText,
  HelpCircle,
  CheckCircle,
  MessageSquare,
  Quote,
  Users,
  Award,
  Images,
  Sparkles,
} from 'lucide-react';
import { FaqEditor, parseFaqContent, serializeFaqContent } from './faq-editor';
import { TermsSectionsEditor } from './terms-sections-editor';
import { GalleryEditor } from './gallery-editor';
import { PageHtmlEditor } from './page-html-editor';
import { TeamGridEditor } from './team-grid-editor';
import {
  CredentialsEditor,
  parseCredentialsContent,
  serializeCredentialsContent,
} from './credentials-editor';
import { useDragDropReorder } from '@/lib/hooks/use-drag-drop-reorder';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import type { PageContentBlock, ContentBlockType } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Content Block Editor — manages content blocks for a page
// ---------------------------------------------------------------------------

interface ContentBlockEditorProps {
  pagePath: string;
  pageType: string;
  pageTitle?: string;
  pageMetaDescription?: string;
  onClose?: () => void;
}

const BLOCK_TYPE_OPTIONS: { value: ContentBlockType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'rich_text', label: 'Rich Text', icon: FileText },
  { value: 'faq', label: 'FAQ', icon: HelpCircle },
  { value: 'features_list', label: 'Features List', icon: CheckCircle },
  { value: 'cta', label: 'Call to Action', icon: MessageSquare },
  { value: 'testimonial_highlight', label: 'Testimonial', icon: Quote },
  { value: 'team_grid', label: 'Team Grid', icon: Users },
  { value: 'credentials', label: 'Credentials', icon: Award },
  { value: 'terms_sections', label: 'Terms Sections', icon: FileText },
  { value: 'gallery', label: 'Gallery', icon: Images },
];

function getBlockTypeLabel(type: ContentBlockType): string {
  return BLOCK_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export function ContentBlockEditor({
  pagePath,
  pageType,
  pageTitle,
  pageMetaDescription,
  onClose,
}: ContentBlockEditorProps) {
  const [blocks, setBlocks] = useState<PageContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addingType, setAddingType] = useState<ContentBlockType | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiBlockId, setAiBlockId] = useState<string | null>(null);
  const { confirm, dialogProps, ConfirmDialog } = useConfirmDialog();

  // -----------------------------------------------------------------------
  // Load blocks
  // -----------------------------------------------------------------------

  const loadBlocks = useCallback(async () => {
    try {
      const res = await adminFetch(
        `/api/admin/cms/content?pagePath=${encodeURIComponent(pagePath)}`
      );
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setBlocks(json.data ?? []);
    } catch {
      toast.error('Failed to load content blocks');
    } finally {
      setLoading(false);
    }
  }, [pagePath]);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  // -----------------------------------------------------------------------
  // Add block
  // -----------------------------------------------------------------------

  const handleAddBlock = async (blockType: ContentBlockType) => {
    setAddingType(blockType);
    try {
      const defaultContent = blockType === 'faq'
        ? '[]'
        : blockType === 'features_list'
        ? '[]'
        : blockType === 'cta'
        ? JSON.stringify({ heading: '', description: '', button_text: 'Book Now', button_url: '/book' })
        : blockType === 'testimonial_highlight'
        ? JSON.stringify({ quote: '', author: '', rating: 5, source: '' })
        : blockType === 'team_grid'
        ? JSON.stringify({ source: 'team_members_table' })
        : blockType === 'credentials'
        ? '[]'
        : blockType === 'terms_sections'
        ? JSON.stringify({ effective_date: null, sections: [] })
        : blockType === 'gallery'
        ? JSON.stringify({ images: [] })
        : '';

      const res = await adminFetch('/api/admin/cms/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_path: pagePath,
          page_type: pageType,
          block_type: blockType,
          title: '',
          content: defaultContent,
        }),
      });

      if (!res.ok) throw new Error('Failed to add block');
      const json = await res.json();
      setBlocks((prev) => [...prev, json.data]);
      setExpandedId(json.data.id);
      toast.success(`${getBlockTypeLabel(blockType)} block added`);
    } catch {
      toast.error('Failed to add block');
    } finally {
      setAddingType(null);
    }
  };

  // -----------------------------------------------------------------------
  // Update block
  // -----------------------------------------------------------------------

  const handleUpdateBlock = async (
    id: string,
    updates: Partial<Pick<PageContentBlock, 'title' | 'content' | 'is_active'>>
  ) => {
    setSavingId(id);
    try {
      const res = await adminFetch(`/api/admin/cms/content/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update');
      const json = await res.json();
      setBlocks((prev) =>
        prev.map((b) => (b.id === id ? json.data : b))
      );
      toast.success('Block saved');
    } catch {
      toast.error('Failed to save block');
    } finally {
      setSavingId(null);
    }
  };

  // -----------------------------------------------------------------------
  // Delete block
  // -----------------------------------------------------------------------

  const handleDeleteBlock = (id: string) => {
    const block = blocks.find((b) => b.id === id);
    const label = block?.title || getBlockTypeLabel(block?.block_type as ContentBlockType) || 'block';
    confirm({
      title: 'Delete Content Block',
      description: `Delete the "${label}" block? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          const res = await adminFetch(`/api/admin/cms/content/${id}`, {
            method: 'DELETE',
          });
          if (!res.ok) throw new Error('Failed to delete');
          setBlocks((prev) => prev.filter((b) => b.id !== id));
          if (expandedId === id) setExpandedId(null);
          toast.success('Block deleted');
        } catch {
          toast.error('Failed to delete block');
        }
      },
    });
  };

  // -----------------------------------------------------------------------
  // Reorder (drag & drop) — using shared hook
  // -----------------------------------------------------------------------

  const handleReorder = useCallback((reorderedBlocks: PageContentBlock[]) => {
    setBlocks(reorderedBlocks);
  }, []);

  const { getDragProps, isDragging: isDragActive } = useDragDropReorder({
    items: blocks,
    onReorder: handleReorder,
  });

  const saveBlockOrder = useCallback(async () => {
    try {
      await adminFetch('/api/admin/cms/content/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagePath,
          orderedIds: blocks.map((b) => b.id),
        }),
      });
    } catch {
      toast.error('Failed to save order');
      loadBlocks();
    }
  }, [blocks, pagePath, loadBlocks]);

  // -----------------------------------------------------------------------
  // Build page context summary for AI
  // -----------------------------------------------------------------------

  const buildPageExistingContent = (): string => {
    return blocks
      .map((b) => {
        const stripped = b.content.replace(/<[^>]*>/g, '').trim();
        return stripped.slice(0, 200);
      })
      .filter(Boolean)
      .join(' | ')
      .slice(0, 800);
  };

  // -----------------------------------------------------------------------
  // AI Generate full page content
  // -----------------------------------------------------------------------

  const doAiGenerateAll = async () => {
    setAiGenerating(true);
    try {
      const res = await adminFetch('/api/admin/cms/content/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'full_page',
          pagePath,
          pageType,
          pageTitle,
          pageMetaDescription,
          autoSave: true,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'AI generation failed');
      }

      toast.success('Content generated and saved');
      await loadBlocks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAiGenerateAll = () => {
    if (blocks.length > 0) {
      confirm({
        title: 'Regenerate All Content',
        description: 'This will replace all existing content blocks with AI-generated content. Continue?',
        confirmLabel: 'Regenerate',
        variant: 'default',
        onConfirm: doAiGenerateAll,
      });
    } else {
      doAiGenerateAll();
    }
  };

  // -----------------------------------------------------------------------
  // AI Improve single block
  // -----------------------------------------------------------------------

  const handleAiImproveBlock = async (block: PageContentBlock) => {
    setAiBlockId(block.id);
    try {
      const res = await adminFetch('/api/admin/cms/content/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'improve',
          pagePath,
          pageType,
          blockType: block.block_type,
          existingContent: block.content,
          pageTitle,
          pageMetaDescription,
          pageExistingContent: buildPageExistingContent(),
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'AI improve failed');
      }

      const json = await res.json();

      // Handle needsContext response
      if (json.data?.needsContext) {
        toast.error(json.data.message || 'Add a page title for better AI content');
        return;
      }

      const improved = json.data?.blocks?.[0];
      if (improved) {
        // Update the block with improved content
        await handleUpdateBlock(block.id, {
          content: improved.content,
          title: improved.title || block.title,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI improve failed');
    } finally {
      setAiBlockId(null);
    }
  };

  // -----------------------------------------------------------------------
  // AI Generate FAQ
  // -----------------------------------------------------------------------

  const handleAiGenerateFaq = async (block: PageContentBlock) => {
    setAiBlockId(block.id);
    try {
      const res = await adminFetch('/api/admin/cms/content/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'single_block',
          pagePath,
          pageType,
          blockType: 'faq',
          pageTitle,
          pageMetaDescription,
          pageExistingContent: buildPageExistingContent(),
        }),
      });

      if (!res.ok) throw new Error('Failed');
      const json = await res.json();

      // Handle needsContext response
      if (json.data?.needsContext) {
        toast.error(json.data.message || 'Add a page title for better AI content');
        return;
      }

      const generated = json.data?.blocks?.[0];
      if (generated) {
        await handleUpdateBlock(block.id, {
          content: generated.content,
          title: generated.title || block.title,
        });
      }
    } catch {
      toast.error('Failed to generate FAQs');
    } finally {
      setAiBlockId(null);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {blocks.length} block{blocks.length !== 1 ? 's' : ''}
          </span>
          {blocks.some((b) => b.ai_generated) && (
            <Badge variant="secondary">AI Generated</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAiGenerateAll}
            disabled={aiGenerating}
          >
            {aiGenerating ? (
              <Spinner size="sm" className="mr-1.5" />
            ) : (
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            {blocks.length > 0 ? 'Regenerate All' : 'AI Generate Content'}
          </Button>
        </div>
      </div>

      {/* Block list */}
      {blocks.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            No content blocks yet. Add blocks manually or use AI to generate content.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {BLOCK_TYPE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddBlock(opt.value)}
                disabled={addingType !== null}
              >
                <opt.icon className="mr-1.5 h-3.5 w-3.5" />
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {blocks.map((block) => (
            <BlockRow
              key={block.id}
              block={block}
              isExpanded={expandedId === block.id}
              isSaving={savingId === block.id}
              isAiLoading={aiBlockId === block.id}
              isDragging={isDragActive(block.id)}
              onToggleExpand={() =>
                setExpandedId(expandedId === block.id ? null : block.id)
              }
              onUpdate={(updates) => handleUpdateBlock(block.id, updates)}
              onDelete={() => handleDeleteBlock(block.id)}
              onAiImprove={() => handleAiImproveBlock(block)}
              onAiGenerateFaq={() => handleAiGenerateFaq(block)}
              dragProps={getDragProps(block.id)}
              onDragDone={saveBlockOrder}
              pagePath={pagePath}
              pageType={pageType}
            />
          ))}
        </div>
      )}

      {/* Add block buttons (when blocks exist) */}
      {blocks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-400 mr-1">Add block:</span>
          {BLOCK_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleAddBlock(opt.value)}
              disabled={addingType !== null}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <opt.icon className="h-3 w-3" />
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block Row — single block with expand/collapse editor
// ---------------------------------------------------------------------------

interface BlockRowProps {
  block: PageContentBlock;
  isExpanded: boolean;
  isSaving: boolean;
  isAiLoading: boolean;
  isDragging: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<Pick<PageContentBlock, 'title' | 'content' | 'is_active'>>) => void;
  onDelete: () => void;
  onAiImprove: () => void;
  onAiGenerateFaq: () => void;
  dragProps: {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    onDrop: (e: React.DragEvent) => void;
  };
  onDragDone: () => void;
  pagePath?: string;
  pageType?: string;
}

function BlockRow({
  block,
  isExpanded,
  isSaving,
  isAiLoading,
  isDragging,
  onToggleExpand,
  onUpdate,
  onDelete,
  onAiImprove,
  onAiGenerateFaq,
  dragProps,
  onDragDone,
  pagePath,
  pageType,
}: BlockRowProps) {
  const [localTitle, setLocalTitle] = useState(block.title ?? '');
  const [localContent, setLocalContent] = useState(block.content);
  const [dirty, setDirty] = useState(false);

  // Sync from parent when block changes (e.g. after AI update)
  useEffect(() => {
    setLocalTitle(block.title ?? '');
    setLocalContent(block.content);
    setDirty(false);
  }, [block.title, block.content]);

  const handleSave = () => {
    // Clean up empty items before saving to DB
    let cleanContent = localContent;
    if (block.block_type === 'faq') {
      try {
        const items = JSON.parse(localContent);
        if (Array.isArray(items)) {
          cleanContent = JSON.stringify(
            items.filter((i: { question?: string; answer?: string }) => i.question?.trim() || i.answer?.trim())
          );
        }
      } catch { /* keep as-is */ }
    } else if (block.block_type === 'features_list') {
      try {
        const items = JSON.parse(localContent);
        if (Array.isArray(items)) {
          cleanContent = JSON.stringify(
            items.filter((i: { title?: string; description?: string }) => i.title?.trim() || i.description?.trim())
          );
        }
      } catch { /* keep as-is */ }
    }
    onUpdate({ title: localTitle.trim() || null, content: cleanContent } as Partial<Pick<PageContentBlock, 'title' | 'content' | 'is_active'>>);
    setDirty(false);
  };

  const contentPreview = getContentPreview(block);

  return (
    <div
      {...dragProps}
      onDragEnd={() => {
        dragProps.onDragEnd();
        onDragDone();
      }}
      className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-opacity ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      {/* Collapsed header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="cursor-grab text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          )}
          <Badge variant="secondary" className="flex-shrink-0 text-[10px]">
            {getBlockTypeLabel(block.block_type as ContentBlockType)}
          </Badge>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {block.title || contentPreview || 'Untitled'}
          </span>
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {block.ai_generated && (
            <span title="AI Generated">
              <Wand2 className="h-3 w-3 text-purple-400" />
            </span>
          )}
          {!block.is_active && (
            <span title="Hidden">
              <EyeOff className="h-3 w-3 text-gray-400" />
            </span>
          )}
          <button
            type="button"
            onClick={() => onUpdate({ is_active: !block.is_active })}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title={block.is_active ? 'Hide block' : 'Show block'}
          >
            {block.is_active ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            title="Delete block"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded editor */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Section Title (optional)
            </label>
            <input
              type="text"
              value={localTitle}
              onChange={(e) => {
                setLocalTitle(e.target.value);
                setDirty(true);
              }}
              placeholder="e.g. Frequently Asked Questions"
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            />
          </div>

          {/* Content — type-specific editor */}
          <BlockContentEditor
            blockType={block.block_type as ContentBlockType}
            content={localContent}
            onChange={(val) => {
              setLocalContent(val);
              setDirty(true);
            }}
            isAiLoading={isAiLoading}
            onAiImprove={onAiImprove}
            onAiGenerateFaq={onAiGenerateFaq}
            pagePath={pagePath}
            pageType={pageType}
          />

          {/* Save — for team_grid, only show when title changed; members save individually */}
          <div className="flex items-center justify-end gap-2 pt-2">
            {block.block_type === 'team_grid' && !dirty && (
              <span className="text-xs text-gray-400 dark:text-gray-500 mr-auto">
                Team members save individually
              </span>
            )}
            {dirty && (
              <span className="text-xs text-amber-600 dark:text-amber-400 mr-auto">
                Unsaved changes
              </span>
            )}
            {(block.block_type !== 'team_grid' || dirty) && (
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={!dirty || isSaving}
              >
                {isSaving ? (
                  <>
                    <Spinner size="sm" className="mr-1" />
                    Saving...
                  </>
                ) : (
                  'Save Block'
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block Content Editor — renders the right editor for each block type
// ---------------------------------------------------------------------------

function BlockContentEditor({
  blockType,
  content,
  onChange,
  isAiLoading,
  onAiImprove,
  onAiGenerateFaq,
  pagePath,
  pageType,
}: {
  blockType: ContentBlockType;
  content: string;
  onChange: (value: string) => void;
  isAiLoading: boolean;
  onAiImprove: () => void;
  onAiGenerateFaq: () => void;
  pagePath?: string;
  pageType?: string;
}) {
  switch (blockType) {
    case 'rich_text':
      return (
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Content (HTML)
          </label>
          <PageHtmlEditor
            value={content}
            onChange={onChange}
            rows={12}
            placeholder="Write your content in HTML..."
          />
        </div>
      );

    case 'faq':
      return (
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            FAQ Items
          </label>
          <FaqEditor
            items={parseFaqContent(content)}
            onChange={(items) => onChange(serializeFaqContent(items))}
            onAiGenerate={onAiGenerateFaq}
            aiLoading={isAiLoading}
          />
        </div>
      );

    case 'features_list':
      return (
        <FeaturesListEditor
          content={content}
          onChange={onChange}
          isAiLoading={isAiLoading}
          onAiImprove={onAiImprove}
        />
      );

    case 'cta':
      return (
        <CtaEditor
          content={content}
          onChange={onChange}
          isAiLoading={isAiLoading}
          onAiGenerate={onAiImprove}
          pagePath={pagePath}
          pageType={pageType}
        />
      );

    case 'testimonial_highlight':
      return (
        <TestimonialEditor
          content={content}
          onChange={onChange}
          isAiLoading={isAiLoading}
          onAiGenerate={onAiImprove}
          pagePath={pagePath}
          pageType={pageType}
        />
      );

    case 'team_grid':
      return (
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Team Members
          </label>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
            Team members are managed directly in the database. Changes save automatically.
          </p>
          <TeamGridEditor />
        </div>
      );

    case 'credentials':
      return (
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Credentials &amp; Certifications
          </label>
          <CredentialsEditor
            value={parseCredentialsContent(content)}
            onChange={(creds) => onChange(serializeCredentialsContent(creds))}
          />
        </div>
      );

    case 'terms_sections':
      return (
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Terms &amp; Conditions Sections
          </label>
          <TermsSectionsEditor
            content={content}
            onChange={onChange}
            pagePath={pagePath}
            pageType={pageType}
          />
        </div>
      );

    case 'gallery':
      return (
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Gallery Images
          </label>
          <GalleryEditor content={content} onChange={onChange} />
        </div>
      );

    default:
      return (
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Features List Editor
// ---------------------------------------------------------------------------

interface FeatureItem {
  title: string;
  description: string;
}

function FeaturesListEditor({
  content,
  onChange,
  isAiLoading,
  onAiImprove,
}: {
  content: string;
  onChange: (val: string) => void;
  isAiLoading: boolean;
  onAiImprove: () => void;
}) {
  let items: FeatureItem[] = [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    // empty
  }

  const updateItems = (newItems: FeatureItem[]) => {
    onChange(JSON.stringify(newItems));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
          Features ({items.length})
        </label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAiImprove}
            disabled={isAiLoading}
          >
            {isAiLoading ? (
              <Spinner size="sm" className="mr-1.5" />
            ) : (
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            AI Improve
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => updateItems([...items, { title: '', description: '' }])}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Feature
          </Button>
        </div>
      </div>
      {items.map((item, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={item.title}
                onChange={(e) => {
                  const updated = [...items];
                  updated[idx] = { ...updated[idx], title: e.target.value };
                  updateItems(updated);
                }}
                placeholder="Feature title"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              />
              <textarea
                value={item.description}
                onChange={(e) => {
                  const updated = [...items];
                  updated[idx] = { ...updated[idx], description: e.target.value };
                  updateItems(updated);
                }}
                placeholder="Feature description"
                rows={2}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              />
            </div>
            <button
              type="button"
              onClick={() => updateItems(items.filter((_, i) => i !== idx))}
              className="mt-1 p-1 text-gray-400 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CTA Editor
// ---------------------------------------------------------------------------

function CtaEditor({
  content,
  onChange,
  isAiLoading,
  onAiGenerate,
  pagePath,
  pageType,
}: {
  content: string;
  onChange: (val: string) => void;
  isAiLoading?: boolean;
  onAiGenerate?: () => void;
  pagePath?: string;
  pageType?: string;
}) {
  const [aiLoading, setAiLoading] = useState(false);
  let data = { heading: '', description: '', button_text: 'Book Now', button_url: '/book' };
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null) data = { ...data, ...parsed };
  } catch {
    // empty
  }

  const update = (field: string, value: string) => {
    onChange(JSON.stringify({ ...data, [field]: value }));
  };

  const handleAiGenerate = async () => {
    setAiLoading(true);
    try {
      const res = await adminFetch('/api/admin/cms/content/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'cta_content',
          pagePath: pagePath || '/',
          pageType: pageType || 'custom',
          existingHeading: data.heading,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      const generated = json.data?.content;
      if (generated) {
        try {
          const parsed = JSON.parse(generated);
          onChange(JSON.stringify({ ...data, ...parsed }));
          toast.success('CTA content generated');
        } catch {
          toast.error('Invalid AI response');
        }
      }
    } catch {
      toast.error('Failed to generate CTA content');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
          Call to Action
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAiGenerate}
          disabled={aiLoading || isAiLoading}
          className="h-7 text-xs"
        >
          {aiLoading ? (
            <Spinner size="sm" className="mr-1" />
          ) : (
            <Sparkles className="mr-1 h-3 w-3" />
          )}
          AI Generate
        </Button>
      </div>
      <div>
        <input
          type="text"
          value={data.heading}
          onChange={(e) => update('heading', e.target.value)}
          placeholder="CTA Heading"
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
      </div>
      <div>
        <textarea
          value={data.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="CTA description text"
          rows={2}
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Button Text</label>
          <input
            type="text"
            value={data.button_text}
            onChange={(e) => update('button_text', e.target.value)}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Button URL</label>
          <input
            type="text"
            value={data.button_url}
            onChange={(e) => update('button_url', e.target.value)}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Testimonial Editor
// ---------------------------------------------------------------------------

function TestimonialEditor({
  content,
  onChange,
  isAiLoading,
  onAiGenerate,
  pagePath,
  pageType,
}: {
  content: string;
  onChange: (val: string) => void;
  isAiLoading?: boolean;
  onAiGenerate?: () => void;
  pagePath?: string;
  pageType?: string;
}) {
  const [aiLoading, setAiLoading] = useState(false);
  let data = { quote: '', author: '', rating: 5, source: '' };
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null) data = { ...data, ...parsed };
  } catch {
    // empty
  }

  const update = (field: string, value: string | number) => {
    onChange(JSON.stringify({ ...data, [field]: value }));
  };

  const handleAiGenerate = async () => {
    setAiLoading(true);
    try {
      const res = await adminFetch('/api/admin/cms/content/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'testimonial_content',
          pagePath: pagePath || '/',
          pageType: pageType || 'custom',
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      const generated = json.data?.content;
      if (generated) {
        try {
          const parsed = JSON.parse(generated);
          onChange(JSON.stringify({ ...data, ...parsed }));
          toast.success('Testimonial content generated');
        } catch {
          toast.error('Invalid AI response');
        }
      }
    } catch {
      toast.error('Failed to generate testimonial');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
          Testimonial
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAiGenerate}
          disabled={aiLoading || isAiLoading}
          className="h-7 text-xs"
        >
          {aiLoading ? (
            <Spinner size="sm" className="mr-1" />
          ) : (
            <Sparkles className="mr-1 h-3 w-3" />
          )}
          AI Generate
        </Button>
      </div>
      <div>
        <textarea
          value={data.quote}
          onChange={(e) => update('quote', e.target.value)}
          placeholder="Customer testimonial text"
          rows={3}
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm italic dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Author</label>
          <input
            type="text"
            value={data.author}
            onChange={(e) => update('author', e.target.value)}
            placeholder="John D."
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Rating (1-5)</label>
          <select
            value={data.rating}
            onChange={(e) => update('rating', parseInt(e.target.value))}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} Star{n !== 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Source</label>
          <input
            type="text"
            value={data.source}
            onChange={(e) => update('source', e.target.value)}
            placeholder="Google Review"
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getContentPreview(block: PageContentBlock): string {
  if (block.block_type === 'rich_text') {
    return block.content.slice(0, 80).replace(/[#*_\[\]()]/g, '');
  }
  if (block.block_type === 'faq') {
    try {
      const items = JSON.parse(block.content);
      return Array.isArray(items) ? `${items.length} question${items.length !== 1 ? 's' : ''}` : '';
    } catch {
      return '';
    }
  }
  if (block.block_type === 'features_list') {
    try {
      const items = JSON.parse(block.content);
      return Array.isArray(items) ? `${items.length} feature${items.length !== 1 ? 's' : ''}` : '';
    } catch {
      return '';
    }
  }
  if (block.block_type === 'cta') {
    try {
      const data = JSON.parse(block.content);
      return data.heading || '';
    } catch {
      return '';
    }
  }
  if (block.block_type === 'team_grid') {
    return 'Team members (from database)';
  }
  if (block.block_type === 'credentials') {
    try {
      const items = JSON.parse(block.content);
      return Array.isArray(items) ? `${items.length} credential${items.length !== 1 ? 's' : ''}` : '';
    } catch {
      return '';
    }
  }
  if (block.block_type === 'terms_sections') {
    try {
      const parsed = JSON.parse(block.content);
      const sections = Array.isArray(parsed) ? parsed : (parsed?.sections ?? []);
      return `${sections.length} section${sections.length !== 1 ? 's' : ''}`;
    } catch {
      return '';
    }
  }
  if (block.block_type === 'gallery') {
    try {
      const parsed = JSON.parse(block.content);
      const images = Array.isArray(parsed) ? parsed : (parsed?.images ?? []);
      return `${images.length} image${images.length !== 1 ? 's' : ''}`;
    } catch {
      return '';
    }
  }
  return '';
}
