'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { adminFetch } from '@/lib/utils/admin-fetch';
import {
  Plus,
  Trash2,
  Link2,
  FileText,
  HelpCircle,
  CheckCircle,
  MessageSquare,
  Quote,
  Users,
  Award,
  Images,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
} from 'lucide-react';
import type { PageContentBlock, ContentBlockType } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Block type label helpers
// ---------------------------------------------------------------------------

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

function getBlockTypeIcon(type: ContentBlockType) {
  return BLOCK_TYPE_OPTIONS.find((o) => o.value === type)?.icon ?? FileText;
}

const DEFAULT_CONTENT: Record<string, string> = {
  rich_text: '',
  faq: '[]',
  features_list: '[]',
  cta: JSON.stringify({ heading: '', description: '', button_text: 'Book Now', button_url: '/book' }),
  testimonial_highlight: JSON.stringify({ quote: '', author: '', rating: 5, source: '' }),
  team_grid: JSON.stringify({ source: 'team_members_table' }),
  credentials: JSON.stringify({ source: 'credentials_table', layout: 'grid', show_descriptions: true, max_items: 0 }),
  terms_sections: JSON.stringify({ effective_date: null, sections: [] }),
  gallery: JSON.stringify({ images: [] }),
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

interface EnrichedBlock extends PageContentBlock {
  _usage_count?: number;
  _pages?: string[];
}

export default function GlobalBlocksPage() {
  const [blocks, setBlocks] = useState<EnrichedBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const { confirm, dialogProps, ConfirmDialog } = useConfirmDialog();

  const loadBlocks = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/global-blocks');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setBlocks(json.data ?? []);
    } catch {
      toast.error('Failed to load global blocks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  const handleCreate = async (globalName: string, blockType: ContentBlockType) => {
    setCreating(true);
    try {
      const res = await adminFetch('/api/admin/cms/global-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_type: blockType,
          global_name: globalName,
          title: '',
          content: DEFAULT_CONTENT[blockType] || '',
        }),
      });
      if (!res.ok) throw new Error('Failed to create');
      toast.success(`Global block "${globalName}" created`);
      setShowCreateDialog(false);
      await loadBlocks();
    } catch {
      toast.error('Failed to create global block');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (block: EnrichedBlock) => {
    const usageCount = block._usage_count ?? 0;
    confirm({
      title: 'Delete Global Block',
      description: usageCount > 0
        ? `"${block.global_name}" is used on ${usageCount} page${usageCount !== 1 ? 's' : ''}. Deleting it will remove it from all pages. This cannot be undone.`
        : `Delete "${block.global_name}"? This cannot be undone.`,
      confirmLabel: 'Delete Permanently',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          const res = await adminFetch(`/api/admin/cms/global-blocks/${block.id}`, {
            method: 'DELETE',
          });
          if (!res.ok) throw new Error('Failed to delete');
          setBlocks((prev) => prev.filter((b) => b.id !== block.id));
          toast.success('Global block deleted');
        } catch {
          toast.error('Failed to delete global block');
        }
      },
    });
  };

  const handleToggleActive = async (block: EnrichedBlock) => {
    try {
      const res = await adminFetch(`/api/admin/cms/content/${block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !block.is_active }),
      });
      if (!res.ok) throw new Error('Failed');
      setBlocks((prev) =>
        prev.map((b) => (b.id === block.id ? { ...b, is_active: !b.is_active } : b))
      );
      toast.success(block.is_active ? 'Block hidden' : 'Block visible');
    } catch {
      toast.error('Failed to update block');
    }
  };

  const filtered = blocks.filter((b) => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      (b.global_name?.toLowerCase().includes(term)) ||
      (b.title?.toLowerCase().includes(term)) ||
      b.block_type.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Global Blocks"
        description="Shared content blocks that can be used across multiple pages."
      />

      {/* Actions bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search global blocks..."
            className="block w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
        </div>
        <Button type="button" onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Global Block
        </Button>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
          <Link2 className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {blocks.length === 0
              ? 'No global blocks yet.'
              : 'No matching blocks found.'}
          </p>
          {blocks.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Create a global block to share content across multiple pages.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((block) => (
            <GlobalBlockRow
              key={block.id}
              block={block}
              onDelete={() => handleDelete(block)}
              onToggleActive={() => handleToggleActive(block)}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateGlobalBlockDialog
          onCreate={handleCreate}
          onClose={() => setShowCreateDialog(false)}
          isCreating={creating}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global Block Row
// ---------------------------------------------------------------------------

function GlobalBlockRow({
  block,
  onDelete,
  onToggleActive,
}: {
  block: EnrichedBlock;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getBlockTypeIcon(block.block_type as ContentBlockType);
  const usageCount = block._usage_count ?? 0;
  const pages = block._pages ?? [];

  const updatedAgo = getTimeAgo(block.updated_at);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 border-l-2 border-l-blue-400 dark:border-l-blue-500">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex-shrink-0 text-gray-400"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <Link2 className="h-4 w-4 text-blue-500 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {block.global_name || 'Untitled'}
            </span>
            <Badge variant="secondary" className="text-[10px] flex-shrink-0">
              <Icon className="mr-0.5 h-2.5 w-2.5" />
              {getBlockTypeLabel(block.block_type as ContentBlockType)}
            </Badge>
            {!block.is_active && (
              <Badge variant="secondary" className="text-[10px] text-gray-400">
                Hidden
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-gray-400">
              Used on {usageCount} page{usageCount !== 1 ? 's' : ''}
            </span>
            <span className="text-[11px] text-gray-400">
              Updated {updatedAgo}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onToggleActive}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            title={block.is_active ? 'Hide block' : 'Show block'}
          >
            {block.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
            title="Delete global block"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-3">
          {/* Pages this block is used on */}
          {pages.length > 0 && (
            <div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Used on pages:
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {pages.map((page) => (
                  <Badge key={page} variant="secondary" className="text-[10px]">
                    {page}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Content preview */}
          <div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Content preview:
            </span>
            <div className="mt-1 rounded-md bg-gray-50 dark:bg-gray-900 p-2 text-xs text-gray-600 dark:text-gray-400 max-h-24 overflow-hidden">
              {getContentPreviewText(block)}
            </div>
          </div>

          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            To edit this block&apos;s content, open any page that uses it and expand the block.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Global Block Dialog
// ---------------------------------------------------------------------------

function CreateGlobalBlockDialog({
  onCreate,
  onClose,
  isCreating,
}: {
  onCreate: (name: string, type: ContentBlockType) => void;
  onClose: () => void;
  isCreating: boolean;
}) {
  const [name, setName] = useState('');
  const [blockType, setBlockType] = useState<ContentBlockType>('rich_text');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    onCreate(name.trim(), blockType);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
        <form onSubmit={handleSubmit}>
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              New Global Block
            </h3>
          </div>
          <div className="px-4 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. "Company FAQ"'
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Block Type
              </label>
              <select
                value={blockType}
                onChange={(e) => setBlockType(e.target.value as ContentBlockType)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              >
                {BLOCK_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isCreating || !name.trim()}>
              {isCreating ? <Spinner size="sm" className="mr-1" /> : null}
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function getContentPreviewText(block: PageContentBlock): string {
  if (block.block_type === 'rich_text') {
    return block.content.replace(/<[^>]*>/g, '').slice(0, 200) || '(empty)';
  }
  if (block.block_type === 'faq') {
    try {
      const items = JSON.parse(block.content);
      if (Array.isArray(items)) return `${items.length} FAQ item${items.length !== 1 ? 's' : ''}`;
    } catch { /* fallthrough */ }
    return '(empty)';
  }
  if (block.block_type === 'features_list') {
    try {
      const items = JSON.parse(block.content);
      if (Array.isArray(items)) return `${items.length} feature${items.length !== 1 ? 's' : ''}`;
    } catch { /* fallthrough */ }
    return '(empty)';
  }
  if (block.block_type === 'cta') {
    try {
      const data = JSON.parse(block.content);
      return data.heading || '(empty)';
    } catch { return '(empty)'; }
  }
  if (block.block_type === 'team_grid') return 'Team members display widget';
  if (block.block_type === 'credentials') return 'Credentials display widget';
  if (block.block_type === 'terms_sections') {
    try {
      const parsed = JSON.parse(block.content);
      const sections = Array.isArray(parsed) ? parsed : (parsed?.sections ?? []);
      return `${sections.length} section${sections.length !== 1 ? 's' : ''}`;
    } catch { return '(empty)'; }
  }
  if (block.block_type === 'gallery') {
    try {
      const parsed = JSON.parse(block.content);
      const images = Array.isArray(parsed) ? parsed : (parsed?.images ?? []);
      return `${images.length} image${images.length !== 1 ? 's' : ''}`;
    } catch { return '(empty)'; }
  }
  return block.content.slice(0, 100) || '(empty)';
}
