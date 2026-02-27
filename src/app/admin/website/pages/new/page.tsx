'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';

// ---------------------------------------------------------------------------
// /admin/website/pages/new — Auto-create a draft page and redirect to editor
// ---------------------------------------------------------------------------

export default function NewPageRedirect() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function createDraft() {
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
        if (!cancelled && res.ok && json.data?.id) {
          router.replace(`/admin/website/pages/${json.data.id}`);
        } else if (!cancelled) {
          toast.error(json.error || 'Failed to create page');
          setError(true);
        }
      } catch {
        if (!cancelled) {
          toast.error('Failed to create page');
          setError(true);
        }
      }
    }

    createDraft();
    return () => { cancelled = true; };
  }, [router]);

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500 mb-4">Failed to create draft page.</p>
        <button
          type="button"
          onClick={() => router.push('/admin/website/pages')}
          className="text-sm text-brand-600 hover:text-brand-700 underline"
        >
          Back to Pages
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12 gap-3">
      <Spinner size="lg" />
      <span className="text-sm text-gray-500">Creating page...</span>
    </div>
  );
}
