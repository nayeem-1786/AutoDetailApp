'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Save, ExternalLink, Eye, Sparkles, History, ChevronDown, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { FormField } from '@/components/ui/form-field';
import { SectionErrorBadge } from '@/components/ui/section-error-badge';
import { PageHtmlEditor } from '@/components/admin/content/page-html-editor';
import { ContentBlockEditor } from '@/components/admin/content/content-block-editor';
import { ImageUploadField } from '@/components/admin/image-upload-field';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ConfirmDialog, useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useFormValidation } from '@/lib/hooks/use-form-validation';
import { useUnsavedChanges } from '@/lib/hooks/use-unsaved-changes';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { formatDistanceToNow } from 'date-fns';
import type { WebsitePage, PageTemplate } from '@/lib/supabase/types';

interface Revision {
  id: string;
  revision_number: number;
  change_summary: string | null;
  created_at: string;
  created_by: string | null;
}

interface RevisionSnapshot {
  page: Record<string, unknown>;
  blocks: Array<{ block_type: string; title: string | null; content: string; sort_order: number }>;
  savedAt: string;
}

export default function EditPagePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [allPages, setAllPages] = useState<WebsitePage[]>([]);

  // Form state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [pageTemplate, setPageTemplate] = useState<PageTemplate>('content');
  const [parentId, setParentId] = useState<string>('');
  const [content, setContent] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [showInNav, setShowInNav] = useState(false);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [ogImageUrl, setOgImageUrl] = useState('');
  const [seoGenerating, setSeoGenerating] = useState(false);
  const [seoGenerated, setSeoGenerated] = useState(false);

  // Revision history state
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [revisionsExpanded, setRevisionsExpanded] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState<RevisionSnapshot | null>(null);
  const [viewingRevisionNumber, setViewingRevisionNumber] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const { confirm, dialogProps, ConfirmDialog: ConfirmDialogComponent } = useConfirmDialog();

  // Track saved values for dirty detection
  const savedValuesRef = useRef({
    title: '', slug: '', pageTemplate: 'content' as PageTemplate,
    parentId: '', content: '', isPublished: false, showInNav: false,
    metaTitle: '', metaDescription: '', ogImageUrl: '',
  });

  const isDirty = loading ? false : (
    title !== savedValuesRef.current.title ||
    slug !== savedValuesRef.current.slug ||
    pageTemplate !== savedValuesRef.current.pageTemplate ||
    parentId !== savedValuesRef.current.parentId ||
    content !== savedValuesRef.current.content ||
    isPublished !== savedValuesRef.current.isPublished ||
    showInNav !== savedValuesRef.current.showInNav ||
    metaTitle !== savedValuesRef.current.metaTitle ||
    metaDescription !== savedValuesRef.current.metaDescription ||
    ogImageUrl !== savedValuesRef.current.ogImageUrl
  );

  // Validation & unsaved changes
  const { errors, validateAndToast, clearAll } = useFormValidation();
  useUnsavedChanges(isDirty);

  const loadPage = useCallback(async () => {
    try {
      const [pageRes, pagesRes] = await Promise.all([
        adminFetch(`/api/admin/cms/pages/${id}`),
        adminFetch('/api/admin/cms/pages'),
      ]);

      const pageJson = await pageRes.json();
      const pagesJson = await pagesRes.json();

      if (pageRes.ok && pageJson.data) {
        const p = pageJson.data as WebsitePage;
        setTitle(p.title);
        setSlug(p.slug);
        setPageTemplate(p.page_template);
        setParentId(p.parent_id || '');
        setContent(p.content || '');
        setIsPublished(p.is_published);
        setShowInNav(p.show_in_nav);
        setMetaTitle(p.meta_title || '');
        setMetaDescription(p.meta_description || '');
        setOgImageUrl(p.og_image_url || '');

        savedValuesRef.current = {
          title: p.title, slug: p.slug, pageTemplate: p.page_template,
          parentId: p.parent_id || '', content: p.content || '',
          isPublished: p.is_published, showInNav: p.show_in_nav,
          metaTitle: p.meta_title || '', metaDescription: p.meta_description || '',
          ogImageUrl: p.og_image_url || '',
        };
      } else {
        toast.error('Page not found');
        router.push('/admin/website/pages');
      }

      if (pagesRes.ok) {
        setAllPages((pagesJson.data || []).filter((p: WebsitePage) => p.id !== id));
      }
    } catch {
      toast.error('Failed to load page');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await adminFetch(`/api/admin/cms/pages/${id}/preview`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to generate preview');
      const { url } = await res.json();
      window.open(url, '_blank');
    } catch {
      toast.error('Failed to generate preview link');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSeoGenerate = async () => {
    const pagePath = `/p/${slug}`;
    if (!title.trim()) {
      toast.error('Enter a page title first');
      return;
    }
    setSeoGenerating(true);
    try {
      const res = await adminFetch('/api/admin/cms/seo/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'single', pagePath }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const { data } = await res.json();
      if (data?.generated) {
        setMetaTitle(data.generated.seo_title || '');
        setMetaDescription(data.generated.meta_description || '');
        setSeoGenerated(true);
        toast.success('SEO fields generated');
      }
    } catch {
      toast.error('Failed to generate SEO');
    } finally {
      setSeoGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const valid = validateAndToast([
      {
        field: 'settings.title',
        value: title,
        validate: (v) => (typeof v === 'string' && v.trim() ? null : 'Page title is required'),
      },
      {
        field: 'settings.slug',
        value: slug,
        validate: (v) => {
          if (typeof v !== 'string' || !v.trim()) return 'Slug is required';
          if (/[^a-z0-9-]/.test(v.trim())) return 'Slug contains invalid characters (use lowercase letters, numbers, and hyphens)';
          return null;
        },
      },
    ]);

    if (!valid) return;

    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/cms/pages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          page_template: pageTemplate,
          parent_id: parentId || null,
          content,
          is_published: isPublished,
          show_in_nav: showInNav,
          meta_title: metaTitle || null,
          meta_description: metaDescription || null,
          og_image_url: ogImageUrl || null,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        toast.success('Page saved');
        clearAll();
        savedValuesRef.current = {
          title: title.trim(), slug: slug.trim(), pageTemplate,
          parentId, content, isPublished, showInNav,
          metaTitle, metaDescription, ogImageUrl,
        };
      } else {
        toast.error(json.error || 'Failed to save page');
      }
    } catch {
      toast.error('Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  // --- Revision history handlers ---
  const loadRevisions = useCallback(async () => {
    setRevisionsLoading(true);
    try {
      const res = await adminFetch(`/api/admin/cms/pages/${id}/revisions`);
      if (res.ok) {
        const json = await res.json();
        setRevisions(json.data || []);
      }
    } catch {
      // silent — non-critical
    } finally {
      setRevisionsLoading(false);
    }
  }, [id]);

  const handleToggleRevisions = () => {
    const next = !revisionsExpanded;
    setRevisionsExpanded(next);
    if (next && revisions.length === 0) {
      loadRevisions();
    }
  };

  const handleViewRevision = async (revisionId: string, revisionNumber: number) => {
    try {
      const res = await adminFetch(`/api/admin/cms/pages/${id}/revisions/${revisionId}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setViewingSnapshot(json.data.snapshot as RevisionSnapshot);
      setViewingRevisionNumber(revisionNumber);
    } catch {
      toast.error('Failed to load revision');
    }
  };

  const handleRestoreRevision = (revisionId: string, revisionNumber: number) => {
    confirm({
      title: `Restore to Revision #${revisionNumber}?`,
      description: 'This will replace the current page content with the saved version. A new revision will be created recording this restore.',
      confirmLabel: 'Restore',
      variant: 'default',
      onConfirm: async () => {
        setRestoring(true);
        try {
          const res = await adminFetch(`/api/admin/cms/pages/${id}/revisions/${revisionId}/restore`, {
            method: 'POST',
          });
          if (!res.ok) throw new Error();
          toast.success(`Restored to revision #${revisionNumber}`);
          // Reload the page data and revisions
          await loadPage();
          await loadRevisions();
        } catch {
          toast.error('Failed to restore revision');
        } finally {
          setRestoring(false);
        }
      },
    });
  };

  // Refresh revisions after save
  const prevSavingRef = useRef(saving);
  useEffect(() => {
    if (prevSavingRef.current && !saving && revisionsExpanded) {
      loadRevisions();
    }
    prevSavingRef.current = saving;
  }, [saving, revisionsExpanded, loadRevisions]);

  if (loading) {
    return (
      <div className="text-center py-12 text-sm text-gray-500">Loading page...</div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit: ${title}`}
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={previewing}
            >
              <Eye className="mr-2 h-4 w-4" />
              {previewing ? 'Opening...' : 'Preview'}
            </Button>
            {isPublished && (
              <a
                href={`/p/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
              >
                <ExternalLink className="h-4 w-4" />
                View Page
              </a>
            )}
            <Button variant="outline" onClick={() => router.push('/admin/website/pages')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Page Settings */}
        <div className="bg-white rounded-lg border shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Page Settings</h2>
            <SectionErrorBadge sectionPrefix="settings" errors={errors} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Title" required error={errors['settings.title']}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </FormField>
            <FormField label="Slug" required error={errors['settings.slug']}>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-400">/p/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </FormField>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
              <select
                value={pageTemplate}
                onChange={(e) => setPageTemplate(e.target.value as PageTemplate)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="content">Content (container + prose)</option>
                <option value="landing">Landing (full-width)</option>
                <option value="blank">Blank (content blocks only)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Page</label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">None (top-level)</option>
                {allPages
                  .filter((p) => !p.parent_id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        {pageTemplate !== 'blank' && (
          <div className="bg-white rounded-lg border shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Content</h2>
            <PageHtmlEditor
              value={content}
              onChange={setContent}
              pageTitle={title}
              placeholder="Write your page content in HTML..."
              rows={16}
            />
          </div>
        )}

        {/* Content Blocks */}
        <div className="bg-white rounded-lg border shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Content Blocks</h2>
          <ContentBlockEditor pagePath={`/p/${slug}`} pageType="custom" pageTitle={title} pageMetaDescription={metaDescription} />
        </div>

        {/* SEO */}
        <div className="bg-white rounded-lg border shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">SEO</h2>
              <SectionErrorBadge sectionPrefix="seo" errors={errors} />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSeoGenerate}
              disabled={seoGenerating || !title.trim()}
            >
              {seoGenerating ? (
                <>
                  <Spinner size="sm" className="mr-1" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  AI Generate
                </>
              )}
            </Button>
          </div>
          {seoGenerated && (
            <p className="text-xs text-amber-600">AI-generated — review and adjust</p>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meta Title</label>
              <input
                type="text"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="Page title for search engines"
              />
              <CharCount value={metaTitle} max={60} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meta Description
              </label>
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                rows={3}
                placeholder="Brief description for search engine results"
              />
              <CharCount value={metaDescription} max={160} />
            </div>
            <ImageUploadField
              label="OG Image"
              value={ogImageUrl}
              onChange={setOgImageUrl}
              folder="og-images"
              placeholder="Upload an image for social sharing"
            />
          </div>
        </div>

        {/* Publishing */}
        <div className="bg-white rounded-lg border shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Publishing</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Published</p>
              <p className="text-xs text-gray-500">Make this page visible to the public</p>
            </div>
            <Switch checked={isPublished} onCheckedChange={setIsPublished} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Show in Navigation</p>
              <p className="text-xs text-gray-500">
                Auto-add to header navigation when enabled
              </p>
            </div>
            <Switch checked={showInNav} onCheckedChange={setShowInNav} />
          </div>
        </div>

        {/* Revision History */}
        <div className="bg-white rounded-lg border shadow-sm">
          <button
            type="button"
            className="w-full p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors rounded-lg"
            onClick={handleToggleRevisions}
          >
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <History className="h-4 w-4" /> Revision History
            </h2>
            <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${revisionsExpanded ? 'rotate-180' : ''}`} />
          </button>

          {revisionsExpanded && (
            <div className="px-6 pb-6">
              {revisionsLoading ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : revisions.length === 0 ? (
                <p className="text-sm text-gray-500">No revisions yet. Save the page to create the first revision.</p>
              ) : (
                <div className="divide-y">
                  {revisions.map((rev) => (
                    <div key={rev.id} className="flex items-center justify-between py-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-gray-900">Revision #{rev.revision_number}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {formatDistanceToNow(new Date(rev.created_at), { addSuffix: true })}
                        </span>
                        {rev.change_summary && (
                          <p className="text-xs text-gray-400 truncate">{rev.change_summary}</p>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewRevision(rev.id, rev.revision_number)}
                        >
                          <Eye className="h-3 w-3 mr-1" /> View
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestoreRevision(rev.id, rev.revision_number)}
                          disabled={restoring}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Restore
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push('/admin/website/pages')}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Page'}
          </Button>
        </div>
      </form>

      {/* Confirm Dialog for Restore */}
      <ConfirmDialogComponent {...dialogProps} loading={restoring} />

      {/* View Revision Modal */}
      <RevisionViewDialog
        snapshot={viewingSnapshot}
        revisionNumber={viewingRevisionNumber}
        onClose={() => setViewingSnapshot(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// RevisionViewDialog — read-only preview of a revision snapshot
// ---------------------------------------------------------------------------
function RevisionViewDialog({
  snapshot,
  revisionNumber,
  onClose,
}: {
  snapshot: RevisionSnapshot | null;
  revisionNumber: number;
  onClose: () => void;
}) {
  if (!snapshot) return null;

  const page = snapshot.page;

  return (
    <Dialog open={!!snapshot} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogHeader>
        <DialogTitle>Revision #{revisionNumber}</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogContent className="max-h-[60vh] overflow-y-auto">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Title</p>
            <p className="text-sm text-gray-900">{page.title as string || '(empty)'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Slug</p>
            <p className="text-sm text-gray-900">/p/{page.slug as string}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Template</p>
            <p className="text-sm text-gray-900">{page.page_template as string}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Status</p>
            <p className="text-sm text-gray-900">{page.is_published ? 'Published' : 'Draft'}</p>
          </div>
          {String(page.meta_title || '') && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Meta Title</p>
              <p className="text-sm text-gray-900">{String(page.meta_title)}</p>
            </div>
          )}
          {String(page.meta_description || '') && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Meta Description</p>
              <p className="text-sm text-gray-900">{String(page.meta_description)}</p>
            </div>
          )}
          {String(page.content || '') && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Content Preview</p>
              <div className="mt-1 max-h-32 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap">
                {String(page.content).replace(/<[^>]+>/g, ' ').slice(0, 500)}
                {String(page.content).length > 500 ? '...' : ''}
              </div>
            </div>
          )}
          {snapshot.blocks.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                Content Blocks ({snapshot.blocks.length})
              </p>
              <div className="space-y-2">
                {snapshot.blocks.map((block, i) => (
                  <div key={i} className="rounded border border-gray-200 bg-gray-50 p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-600 bg-gray-200 px-1.5 py-0.5 rounded">
                        {block.block_type}
                      </span>
                      {block.title && (
                        <span className="text-xs text-gray-700">{block.title}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Saved At</p>
            <p className="text-sm text-gray-900">
              {new Date(snapshot.savedAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}
            </p>
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// CharCount — character count indicator with color coding
// ---------------------------------------------------------------------------
function CharCount({ value, max }: { value: string; max: number }) {
  const len = value.length;
  const color =
    len === 0
      ? 'text-gray-400'
      : len <= max * 0.85
        ? 'text-green-600'
        : len <= max
          ? 'text-amber-600'
          : 'text-red-600';

  return (
    <p className={`mt-1 text-xs ${color}`}>
      {len}/{max} chars
    </p>
  );
}
