'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { EmailTemplate, EmailTemplateCategory } from '@/lib/email/types';

const CATEGORIES: { value: string; label: string }[] = [
  { value: '', label: 'All Categories' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'review', label: 'Review' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'notification', label: 'Notification' },
];

const CATEGORY_COLORS: Record<EmailTemplateCategory, string> = {
  transactional: 'info',
  review: 'success',
  marketing: 'warning',
  notification: 'secondary',
};

export function TemplateList() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const res = await adminFetch('/api/admin/email-templates?limit=200', { cache: 'no-store' });
      const json = await res.json();
      setTemplates(json.data || []);
    } catch {
      // adminFetch handles 401 redirect
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!categoryFilter) return templates;
    return templates.filter((t) => t.category === categoryFilter);
  }, [templates, categoryFilter]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminFetch(`/api/admin/email-templates/${deleteTarget.id}`, { method: 'DELETE' });
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      // handled
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters + actions row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="max-w-48"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>

        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            onClick={() => router.push('/admin/marketing/email-templates/layouts')}
          >
            Edit Layouts
          </Button>
        </div>
      </div>

      {/* Template grid */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-sm text-gray-500">
            {categoryFilter ? 'No templates in this category.' : 'No email templates yet.'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Templates will be seeded when the system is fully configured.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={() => router.push(`/admin/marketing/email-templates/${template.id}`)}
              onDelete={template.is_system ? undefined : () => setDeleteTarget(template)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Template"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: EmailTemplate;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const layoutName = (template as unknown as { email_layouts?: { name: string } }).email_layouts?.name;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900">{template.name}</h3>
          <p className="mt-0.5 truncate text-xs text-gray-500">{template.subject}</p>
        </div>
        <div className="ml-2 flex shrink-0 gap-1">
          <Badge variant={CATEGORY_COLORS[template.category] as 'info' | 'success' | 'warning' | 'secondary'}>
            {template.category}
          </Badge>
          {template.is_system && (
            <Badge variant="default">System</Badge>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
        {layoutName && <span>Layout: {layoutName}</span>}
        <span>v{template.version}</span>
        {template.segment_tag && <span>Segment: {template.segment_tag}</span>}
        {template.is_customized && <span className="text-amber-500">Customized</span>}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onEdit} className="flex-1">
          Edit
        </Button>
        {onDelete && (
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-500 hover:text-red-700">
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
