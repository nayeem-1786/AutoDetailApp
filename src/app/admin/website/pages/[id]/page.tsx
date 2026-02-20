'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Save, ExternalLink, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { PageHtmlEditor } from '@/components/admin/content/page-html-editor';
import { ContentBlockEditor } from '@/components/admin/content/content-block-editor';
import { adminFetch } from '@/lib/utils/admin-fetch';
import type { WebsitePage, PageTemplate } from '@/lib/supabase/types';

export default function EditPagePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

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
      } else {
        toast.error(json.error || 'Failed to save page');
      }
    } catch {
      toast.error('Failed to save page');
    } finally {
      setSaving(false);
    }
  };

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
          <h2 className="text-lg font-semibold text-gray-900">Page Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-400">/p/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
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
          <ContentBlockEditor pagePath={`/p/${slug}`} pageType="custom" />
        </div>

        {/* SEO */}
        <div className="bg-white rounded-lg border shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">SEO</h2>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">OG Image URL</label>
              <input
                type="url"
                value={ogImageUrl}
                onChange={(e) => setOgImageUrl(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="https://..."
              />
            </div>
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
    </div>
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
