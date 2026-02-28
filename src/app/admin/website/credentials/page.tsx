'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Award,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { FormField } from '@/components/ui/form-field';
import { ImageUploadField } from '@/components/admin/image-upload-field';
import { PageHtmlEditor } from '@/components/admin/content/page-html-editor';
import { DragDropItem } from '@/components/admin/drag-drop-reorder';
import { useDragDropReorder } from '@/lib/hooks/use-drag-drop-reorder';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Credential {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Credentials Admin Page
// ---------------------------------------------------------------------------

export default function CredentialsAdminPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { confirm, dialogProps, ConfirmDialog } = useConfirmDialog();

  // -------------------------------------------------------------------------
  // Load credentials from API
  // -------------------------------------------------------------------------

  const loadCredentials = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/credentials');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setCredentials(json.data ?? []);
    } catch {
      toast.error('Failed to load credentials');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  // -------------------------------------------------------------------------
  // AI Generate Description
  // -------------------------------------------------------------------------

  const handleAiGenerateDescription = async (cred: Credential) => {
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
        updateCredentialLocal(cred.id, { description: json.data.content });
        toast.success('Description generated — click Save to keep');
      }
    } catch {
      toast.error('Failed to generate description');
    } finally {
      setAiLoadingId(null);
    }
  };

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  const addCredential = async () => {
    setSavingId('new');
    try {
      const res = await adminFetch('/api/admin/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Credential',
          description: '',
          image_url: '',
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setCredentials((prev) => [...prev, json.data]);
      setExpandedId(json.data.id);
      toast.success('Credential added');
    } catch {
      toast.error('Failed to add credential');
    } finally {
      setSavingId(null);
    }
  };

  const saveCredential = async (id: string, updates: Partial<Credential>): Promise<boolean> => {
    setSavingId(id);
    try {
      const res = await adminFetch(`/api/admin/credentials/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      const json = await res.json();
      setCredentials((prev) =>
        prev.map((c) => (c.id === id ? json.data : c))
      );
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const removeCredential = (cred: Credential) => {
    confirm({
      title: 'Delete Credential',
      description: `Remove "${cred.title || 'this credential'}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          const res = await adminFetch(`/api/admin/credentials/${cred.id}`, {
            method: 'DELETE',
          });
          if (!res.ok) throw new Error('Failed');
          setCredentials((prev) => prev.filter((c) => c.id !== cred.id));
          if (expandedId === cred.id) setExpandedId(null);
          setErrors((prev) => {
            const next = { ...prev };
            delete next[cred.id];
            return next;
          });
          toast.success('Credential deleted');
        } catch {
          toast.error('Failed to delete credential');
        }
      },
    });
  };

  const toggleActive = async (cred: Credential) => {
    const newVal = !cred.is_active;
    // Optimistic
    setCredentials((prev) =>
      prev.map((c) => (c.id === cred.id ? { ...c, is_active: newVal } : c))
    );
    try {
      const res = await adminFetch(`/api/admin/credentials/${cred.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newVal }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      // Revert
      setCredentials((prev) =>
        prev.map((c) => (c.id === cred.id ? { ...c, is_active: !newVal } : c))
      );
      toast.error('Failed to update status');
    }
  };

  // Local update
  const updateCredentialLocal = (id: string, updates: Partial<Credential>) => {
    setCredentials((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
    if (errors[id]) {
      const fieldErrors = { ...errors[id] };
      for (const key of Object.keys(updates)) {
        delete fieldErrors[key];
      }
      setErrors((prev) => ({ ...prev, [id]: fieldErrors }));
    }
  };

  // -------------------------------------------------------------------------
  // Drag-drop reorder
  // -------------------------------------------------------------------------

  const handleReorder = useCallback(
    async (reordered: Credential[]) => {
      setCredentials(reordered);
      try {
        await adminFetch('/api/admin/credentials/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderedIds: reordered.map((c) => c.id),
          }),
        });
      } catch {
        toast.error('Failed to save order');
        loadCredentials();
      }
    },
    [loadCredentials]
  );

  const { getDragProps, isDragging, isDragOver } = useDragDropReorder({
    items: credentials,
    onReorder: handleReorder,
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

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

  const handleSaveCredential = async (cred: Credential) => {
    if (!cred.title.trim()) {
      setErrors((prev) => ({
        ...prev,
        [cred.id]: { ...(prev[cred.id] || {}), title: 'Title is required' },
      }));
      toast.error('Title is required');
      return;
    }

    const ok = await saveCredential(cred.id, {
      title: cred.title,
      description: cred.description,
      image_url: cred.image_url,
    });
    if (ok) toast.success('Credential saved');
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog {...dialogProps} />

      <PageHeader
        title="Credentials & Awards"
        description="Manage business certifications, awards, and credentials displayed on your website."
        action={
          <Button onClick={addCredential} disabled={savingId === 'new'}>
            {savingId === 'new' ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add Credential
          </Button>
        }
      />

      {/* Empty state */}
      {credentials.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center">
          <Award className="mx-auto h-10 w-10 text-gray-400 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            No credentials yet. Add your first credential to display on the website.
          </p>
          <Button variant="outline" onClick={addCredential} disabled={savingId === 'new'}>
            <Plus className="mr-2 h-4 w-4" />
            Add First Credential
          </Button>
        </div>
      )}

      {/* Credentials list */}
      <div className="space-y-3">
        {credentials.map((cred) => (
          <DragDropItem
            key={cred.id}
            dragProps={getDragProps(cred.id)}
            isDragging={isDragging(cred.id)}
            isDragOver={isDragOver(cred.id)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            <div className="w-full">
              {/* Card header */}
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(expandedId === cred.id ? null : cred.id)
                  }
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  {expandedId === cred.id ? (
                    <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                  {/* Image thumbnail */}
                  {cred.image_url ? (
                    <img
                      src={cred.image_url}
                      alt=""
                      className="h-10 w-10 rounded object-contain flex-shrink-0 bg-gray-50 dark:bg-gray-700 p-0.5"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <Award className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {cred.title || 'New Credential'}
                  </span>
                  {savingId === cred.id && (
                    <Spinner size="sm" className="flex-shrink-0" />
                  )}
                </button>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Switch
                    checked={cred.is_active}
                    onCheckedChange={() => toggleActive(cred)}
                  />
                  <Badge variant={cred.is_active ? 'success' : 'default'}>
                    {cred.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => removeCredential(cred)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete credential"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Expanded editor */}
              {expandedId === cred.id && (
                <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 space-y-4">
                  {/* Image */}
                  <ImageUploadField
                    value={cred.image_url || ''}
                    onChange={(url) => updateCredentialLocal(cred.id, { image_url: url })}
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
                        updateCredentialLocal(cred.id, { title: e.target.value })
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
                      value={cred.description || ''}
                      onChange={(val) => updateCredentialLocal(cred.id, { description: val })}
                      pageTitle={`${cred.title || 'Credential'} Description`}
                      placeholder="Describe this credential or certification..."
                      rows={6}
                    />
                  </div>

                  {/* Save */}
                  <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSaveCredential(cred)}
                      disabled={savingId === cred.id}
                    >
                      {savingId === cred.id ? (
                        <>
                          <Spinner size="sm" className="mr-1" />
                          Saving...
                        </>
                      ) : (
                        'Save Credential'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DragDropItem>
        ))}
      </div>
    </div>
  );
}
