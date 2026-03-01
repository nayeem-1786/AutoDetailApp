'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, FileText, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { adminFetch } from '@/lib/utils/admin-fetch';
import type { WebsitePage, PageTemplate } from '@/lib/supabase/types';

const TEMPLATE_LABELS: Record<PageTemplate, string> = {
  content: 'Content',
  landing: 'Landing',
  blank: 'Blank',
};

const TEMPLATE_COLORS: Record<PageTemplate, string> = {
  content: 'bg-blue-100 text-blue-700',
  landing: 'bg-purple-100 text-purple-700',
  blank: 'bg-gray-100 text-gray-700',
};

export default function PagesListPage() {
  const router = useRouter();
  const { confirm, dialogProps, ConfirmDialog } = useConfirmDialog();
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/pages');
      const json = await res.json();
      if (res.ok) {
        setPages(json.data || []);
      }
    } catch {
      toast.error('Failed to load pages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  // -------------------------------------------------------------------------
  // Auto-create draft page
  // -------------------------------------------------------------------------

  const createDraft = async () => {
    setCreating(true);
    try {
      const res = await adminFetch('/api/admin/cms/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Untitled Page',
          slug: `untitled-${Date.now()}`,
          page_template: 'content',
          is_published: false,
        }),
      });

      const json = await res.json();
      if (res.ok && json.data?.id) {
        router.push(`/admin/website/pages/${json.data.id}`);
      } else {
        toast.error(json.error || 'Failed to create page');
        setCreating(false);
      }
    } catch {
      toast.error('Failed to create page');
      setCreating(false);
    }
  };

  const togglePublished = async (page: WebsitePage) => {
    const newValue = !page.is_published;
    // Optimistic update — if unpublishing, also turn off show_in_nav
    setPages((prev) =>
      prev.map((p) =>
        p.id === page.id
          ? { ...p, is_published: newValue, ...(!newValue && { show_in_nav: false }) }
          : p
      )
    );

    const res = await adminFetch(`/api/admin/cms/pages/${page.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: newValue }),
    });

    if (!res.ok) {
      // Revert
      setPages((prev) =>
        prev.map((p) => (p.id === page.id ? { ...p, is_published: !newValue, show_in_nav: page.show_in_nav } : p))
      );
      toast.error('Failed to update page');
    }
  };

  const toggleShowInNav = async (page: WebsitePage) => {
    const newValue = !page.show_in_nav;
    setPages((prev) =>
      prev.map((p) => (p.id === page.id ? { ...p, show_in_nav: newValue } : p))
    );

    const res = await adminFetch(`/api/admin/cms/pages/${page.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_in_nav: newValue }),
    });

    if (!res.ok) {
      setPages((prev) =>
        prev.map((p) => (p.id === page.id ? { ...p, show_in_nav: !newValue } : p))
      );
      toast.error('Failed to update page');
    } else {
      toast.success(newValue ? 'Added to navigation' : 'Removed from navigation');
    }
  };

  const deletePage = (page: WebsitePage) => {
    confirm({
      title: 'Delete Page',
      description: `Delete "${page.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        setDeletingId(page.id);
        const res = await adminFetch(`/api/admin/cms/pages/${page.id}`, {
          method: 'DELETE',
        });

        if (res.ok) {
          setPages((prev) => prev.filter((p) => p.id !== page.id));
          toast.success('Page deleted');
        } else {
          toast.error('Failed to delete page');
        }
        setDeletingId(null);
      },
    });
  };

  // Build indentation for child pages
  const getIndent = (page: WebsitePage): number => {
    if (!page.parent_id) return 0;
    const parent = pages.find((p) => p.id === page.parent_id);
    return parent ? 1 + getIndent(parent) : 0;
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog {...dialogProps} />
      <PageHeader
        title="Pages"
        description="Create and manage custom pages for your website."
        action={
          <Button onClick={createDraft} disabled={creating}>
            {creating ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {creating ? 'Creating...' : 'Create Page'}
          </Button>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500">Loading...</div>
      ) : pages.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm text-gray-500">No pages yet. Create your first page.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Slug
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Template
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Published
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  In Nav
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pages.map((page) => {
                const indent = getIndent(page);
                return (
                  <tr
                    key={page.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/admin/website/pages/${page.id}`)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <span style={{ paddingLeft: indent * 20 }}>
                        {indent > 0 && <span className="text-gray-400 mr-1">└</span>}
                        {page.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        /p/{page.slug}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={TEMPLATE_COLORS[page.page_template]}
                        variant="secondary"
                      >
                        {TEMPLATE_LABELS[page.page_template]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={page.is_published}
                        onCheckedChange={() => togglePublished(page)}
                      />
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-center gap-0.5">
                        <Switch
                          checked={page.show_in_nav}
                          onCheckedChange={() => toggleShowInNav(page)}
                          disabled={!page.is_published}
                        />
                        {!page.is_published && (
                          <span className="text-[10px] text-gray-400">Publish first</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(page.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {page.is_published && (
                          <a
                            href={`/p/${page.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-gray-600"
                            title="View page"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => deletePage(page)}
                          disabled={deletingId === page.id}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
