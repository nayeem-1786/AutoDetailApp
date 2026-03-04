'use client';

import { useEffect, useState, useMemo } from 'react';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

interface TemplatePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: EmailTemplate) => void;
  categoryFilter?: EmailTemplateCategory;
}

export function TemplatePickerModal({
  open,
  onOpenChange,
  onSelect,
  categoryFilter,
}: TemplatePickerModalProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(categoryFilter || '');

  useEffect(() => {
    if (open) loadTemplates();
  }, [open]);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/email-templates?limit=200', { cache: 'no-store' });
      const json = await res.json();
      setTemplates(json.data || []);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!category) return templates;
    return templates.filter((t) => t.category === category);
  }, [templates, category]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose a Template</DialogTitle>
        </DialogHeader>

        {!categoryFilter && (
          <div className="mb-4">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">No templates found.</p>
          </div>
        ) : (
          <div className="max-h-[400px] space-y-2 overflow-y-auto">
            {filtered.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  onSelect(template);
                  onOpenChange(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-3 text-left transition hover:border-gray-300 hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-sm font-semibold text-gray-900">{template.name}</h4>
                    <Badge variant={CATEGORY_COLORS[template.category] as 'info' | 'success' | 'warning' | 'secondary'}>
                      {template.category}
                    </Badge>
                    {template.is_system && (
                      <Badge variant="default">System</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">{template.subject}</p>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" tabIndex={-1}>
                  Select
                </Button>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
