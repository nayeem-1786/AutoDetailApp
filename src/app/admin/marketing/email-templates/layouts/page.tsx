'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { EmailLayout } from '@/lib/email/types';

export default function LayoutManagerPage() {
  const router = useRouter();
  const [layouts, setLayouts] = useState<EmailLayout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLayouts();
  }, []);

  async function loadLayouts() {
    try {
      const res = await adminFetch('/api/admin/email-templates/layouts', { cache: 'no-store' });
      const json = await res.json();
      setLayouts(json.data || []);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Email Layouts" description="Manage structural HTML frames for emails." />
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Layouts"
        description="3 pre-built email layouts. Edit colors and header/footer settings — structure cannot be changed."
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {layouts.map((layout) => (
          <LayoutCard
            key={layout.id}
            layout={layout}
            onEdit={() => router.push(`/admin/marketing/email-templates/layouts/${layout.id}`)}
          />
        ))}
      </div>
    </div>
  );
}

function LayoutCard({ layout, onEdit }: { layout: EmailLayout; onEdit: () => void }) {
  const overrides = layout.color_overrides || {};
  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md">
      {/* Mini preview strip */}
      <div
        className="flex h-16 items-center justify-center rounded-t-lg text-xs font-bold uppercase tracking-wider text-white"
        style={{ backgroundColor: overrides.primary_color || '#1a1a2e' }}
      >
        {layout.name}
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{layout.name}</h3>
          {layout.is_default && <Badge variant="success">Default</Badge>}
          {hasOverrides && <Badge variant="warning">Custom Colors</Badge>}
        </div>

        <p className="mb-3 text-xs text-gray-500">{layout.description}</p>

        {/* Config summary */}
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-gray-400">
          <span>Logo: {layout.header_config.logo_position}</span>
          <span>Social: {layout.footer_config.show_social ? 'Yes' : 'No'}</span>
          <span>Footer: {layout.footer_config.compact ? 'Compact' : 'Full'}</span>
        </div>

        {/* Color swatches */}
        {hasOverrides && (
          <div className="mb-4 flex gap-1">
            {Object.entries(overrides).map(([key, color]) => (
              <div
                key={key}
                className="h-5 w-5 rounded border border-gray-200"
                style={{ backgroundColor: color }}
                title={`${key}: ${color}`}
              />
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" onClick={onEdit} className="w-full">
          Edit Settings
        </Button>
      </div>
    </div>
  );
}
