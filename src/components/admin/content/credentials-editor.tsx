'use client';

import { useState, useCallback } from 'react';
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { FormField } from '@/components/ui/form-field';
import { ImageUploadField } from '@/components/admin/image-upload-field';
import { PageHtmlEditor } from '@/components/admin/content/page-html-editor';
import { DragDropItem } from '@/components/admin/drag-drop-reorder';
import { useDragDropReorder } from '@/lib/hooks/use-drag-drop-reorder';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// CredentialsEditor — manages credentials block content
// ---------------------------------------------------------------------------

export interface CredentialItem {
  id: string;
  title: string;
  description: string;
  image_url: string;
  sort_order: number;
}

interface CredentialsEditorProps {
  value: CredentialItem[];
  onChange: (credentials: CredentialItem[]) => void;
}

function generateId(): string {
  return crypto.randomUUID();
}

export function CredentialsEditor({ value, onChange }: CredentialsEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const { confirm, dialogProps, ConfirmDialog } = useConfirmDialog();

  const handleAiGenerateDescription = async (cred: CredentialItem) => {
    if (!cred.title.trim()) {
      toast.error('Enter a title first');
      return;
    }
    setAiLoadingId(cred.id);
    try {
      const res = await adminFetch('/api/admin/cms/content/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'credential_description',
          credentialTitle: cred.title,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      if (json.data?.content) {
        updateCredential(cred.id, { description: json.data.content });
        toast.success('Description generated');
      }
    } catch {
      toast.error('Failed to generate description');
    } finally {
      setAiLoadingId(null);
    }
  };

  const handleReorder = useCallback(
    (reordered: CredentialItem[]) => {
      onChange(reordered.map((c, i) => ({ ...c, sort_order: i })));
    },
    [onChange]
  );

  const { getDragProps, isDragging, isDragOver } = useDragDropReorder({
    items: value,
    onReorder: handleReorder,
  });

  const addCredential = () => {
    const newCred: CredentialItem = {
      id: generateId(),
      title: '',
      description: '',
      image_url: '',
      sort_order: value.length,
    };
    onChange([...value, newCred]);
    setExpandedId(newCred.id);
  };

  const removeCredential = (id: string) => {
    const cred = value.find((c) => c.id === id);
    confirm({
      title: 'Delete Credential',
      description: `Remove ${cred?.title || 'this credential'}? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: () => {
        onChange(value.filter((c) => c.id !== id).map((c, i) => ({ ...c, sort_order: i })));
        if (expandedId === id) setExpandedId(null);
        setErrors((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      },
    });
  };

  const updateCredential = (id: string, updates: Partial<CredentialItem>) => {
    onChange(
      value.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );

    // Clear errors for updated fields
    if (errors[id]) {
      const fieldErrors = { ...errors[id] };
      for (const key of Object.keys(updates)) {
        delete fieldErrors[key];
      }
      setErrors((prev) => ({ ...prev, [id]: fieldErrors }));
    }
  };

  const getCredentialError = (credId: string, field: string): string | undefined => {
    return errors[credId]?.[field];
  };

  const validateField = (credId: string, field: string, val: string) => {
    if (field === 'title' && !val.trim()) {
      setErrors((prev) => ({
        ...prev,
        [credId]: {
          ...(prev[credId] || {}),
          [field]: 'Title is required',
        },
      }));
    } else {
      setErrors((prev) => {
        const credErrors = { ...(prev[credId] || {}) };
        delete credErrors[field];
        if (Object.keys(credErrors).length === 0) {
          const next = { ...prev };
          delete next[credId];
          return next;
        }
        return { ...prev, [credId]: credErrors };
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {value.length} Credential{value.length !== 1 ? 's' : ''}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={addCredential}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Credential
        </Button>
      </div>

      {/* Empty state */}
      {value.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No credentials yet. Click &ldquo;Add Credential&rdquo; to get started.
          </p>
        </div>
      )}

      {/* Credentials list */}
      {value.map((cred) => (
        <DragDropItem
          key={cred.id}
          dragProps={getDragProps(cred.id)}
          isDragging={isDragging(cred.id)}
          isDragOver={isDragOver(cred.id)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        >
          <div className="w-full">
            {/* Card header */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() =>
                  setExpandedId(expandedId === cred.id ? null : cred.id)
                }
                className="flex-1 flex items-center gap-2 text-left min-w-0"
              >
                {expandedId === cred.id ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {cred.title || 'New Credential'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => removeCredential(cred.id)}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                title="Delete credential"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Expanded editor */}
            {expandedId === cred.id && (
              <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 space-y-4">
                {/* Image */}
                <ImageUploadField
                  value={cred.image_url}
                  onChange={(url) => updateCredential(cred.id, { image_url: url })}
                  label="Badge / Logo Image"
                  placeholder="Upload credential badge or logo"
                  folder="credentials"
                />

                {/* Title */}
                <FormField
                  label="Title"
                  required
                  error={getCredentialError(cred.id, 'title')}
                >
                  <input
                    type="text"
                    value={cred.title}
                    onChange={(e) =>
                      updateCredential(cred.id, { title: e.target.value })
                    }
                    onBlur={(e) => validateField(cred.id, 'title', e.target.value)}
                    placeholder="e.g. Ceramic Pro Certified Installer"
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  />
                </FormField>

                {/* Description */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Description
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAiGenerateDescription(cred)}
                      disabled={aiLoadingId === cred.id || !cred.title.trim()}
                      className="h-7 text-xs"
                    >
                      {aiLoadingId === cred.id ? (
                        <Spinner size="sm" className="mr-1" />
                      ) : (
                        <Sparkles className="mr-1 h-3 w-3" />
                      )}
                      AI Generate Description
                    </Button>
                  </div>
                  <PageHtmlEditor
                    value={cred.description}
                    onChange={(val) => updateCredential(cred.id, { description: val })}
                    pageTitle={`${cred.title || 'Credential'} Description`}
                    placeholder="Describe this credential or certification..."
                    rows={6}
                  />
                </div>
              </div>
            )}
          </div>
        </DragDropItem>
      ))}

      {/* Add button at bottom */}
      {value.length > 0 && (
        <Button type="button" variant="outline" size="sm" onClick={addCredential} className="w-full">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Credential
        </Button>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parse / Serialize helpers
// ---------------------------------------------------------------------------

export function parseCredentialsContent(content: string): CredentialItem[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.map((item: Partial<CredentialItem>, i: number) => ({
        id: item.id || generateId(),
        title: item.title || '',
        description: item.description || '',
        image_url: item.image_url || '',
        sort_order: item.sort_order ?? i,
      }));
    }
  } catch {
    // fallback
  }
  return [];
}

export function serializeCredentialsContent(credentials: CredentialItem[]): string {
  return JSON.stringify(
    credentials
      .filter((c) => c.title.trim())
      .map((c, i) => ({ ...c, sort_order: i }))
  );
}
