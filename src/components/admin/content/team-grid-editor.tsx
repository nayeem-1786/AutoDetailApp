'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
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
// TeamGridEditor — manages team_members table via API
// ---------------------------------------------------------------------------

export interface TeamGridMember {
  id: string;
  name: string;
  role: string;
  bio: string;
  photo_url: string;
  slug: string;
  years_of_service: number | null;
  certifications: string[];
  sort_order: number;
  is_active?: boolean;
}

export function TeamGridEditor() {
  const [members, setMembers] = useState<TeamGridMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { confirm, dialogProps, ConfirmDialog } = useConfirmDialog();

  // -------------------------------------------------------------------------
  // Load members from API
  // -------------------------------------------------------------------------

  const loadMembers = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/team-members');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setMembers(json.data ?? []);
    } catch {
      toast.error('Failed to load team members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // -------------------------------------------------------------------------
  // AI Generate Bio
  // -------------------------------------------------------------------------

  const handleAiGenerateBio = async (member: TeamGridMember) => {
    if (!member.name.trim() || !member.role.trim()) {
      toast.error('Enter a name and role first');
      return;
    }
    setAiLoadingId(member.id);
    try {
      const res = await adminFetch('/api/admin/cms/content/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'team_bio',
          memberName: member.name,
          memberRole: member.role,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      if (json.data?.content) {
        await saveMember(member.id, { bio: json.data.content });
        toast.success('Bio generated');
      }
    } catch {
      toast.error('Failed to generate bio');
    } finally {
      setAiLoadingId(null);
    }
  };

  // -------------------------------------------------------------------------
  // CRUD via API — auto-save pattern
  // -------------------------------------------------------------------------

  const addMember = async () => {
    setSavingId('new');
    try {
      const res = await adminFetch('/api/admin/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Member',
          role: 'Team Member',
          bio: '',
          photo_url: '',
          years_of_service: null,
          certifications: [],
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setMembers((prev) => [...prev, json.data]);
      setExpandedId(json.data.id);
      toast.success('Team member added');
    } catch {
      toast.error('Failed to add team member');
    } finally {
      setSavingId(null);
    }
  };

  const saveMember = async (id: string, updates: Partial<TeamGridMember>) => {
    setSavingId(id);
    try {
      const res = await adminFetch(`/api/admin/team-members/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      const json = await res.json();
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? json.data : m))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingId(null);
    }
  };

  const removeMember = (member: TeamGridMember) => {
    confirm({
      title: 'Delete Team Member',
      description: `Remove ${member.name || 'this member'}? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          const res = await adminFetch(`/api/admin/team-members/${member.id}`, {
            method: 'DELETE',
          });
          if (!res.ok) throw new Error('Failed');
          setMembers((prev) => prev.filter((m) => m.id !== member.id));
          if (expandedId === member.id) setExpandedId(null);
          setErrors((prev) => {
            const next = { ...prev };
            delete next[member.id];
            return next;
          });
          toast.success('Team member deleted');
        } catch {
          toast.error('Failed to delete team member');
        }
      },
    });
  };

  // Local update — saves on blur
  const updateMemberLocal = (id: string, updates: Partial<TeamGridMember>) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
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

  // -------------------------------------------------------------------------
  // Drag-drop reorder
  // -------------------------------------------------------------------------

  const handleReorder = useCallback(
    async (reordered: TeamGridMember[]) => {
      setMembers(reordered);
      // Save to API
      try {
        await adminFetch('/api/admin/team-members/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderedIds: reordered.map((m) => m.id),
          }),
        });
      } catch {
        toast.error('Failed to save order');
        loadMembers();
      }
    },
    [loadMembers]
  );

  const { getDragProps, isDragging, isDragOver } = useDragDropReorder({
    items: members,
    onReorder: handleReorder,
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  const getMemberError = (memberId: string, field: string): string | undefined => {
    return errors[memberId]?.[field];
  };

  const validateField = (memberId: string, field: string, val: string) => {
    if ((field === 'name' || field === 'role') && !val.trim()) {
      setErrors((prev) => ({
        ...prev,
        [memberId]: {
          ...(prev[memberId] || {}),
          [field]: `${field === 'name' ? 'Name' : 'Role'} is required`,
        },
      }));
    } else {
      setErrors((prev) => {
        const memberErrors = { ...(prev[memberId] || {}) };
        delete memberErrors[field];
        if (Object.keys(memberErrors).length === 0) {
          const next = { ...prev };
          delete next[memberId];
          return next;
        }
        return { ...prev, [memberId]: memberErrors };
      });
    }
  };

  // Save field on blur
  const handleFieldBlur = (memberId: string, field: string, value: string) => {
    validateField(memberId, field, value);
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    // Only save if value actually changed from what we have
    const currentVal = member[field as keyof TeamGridMember];
    if (value !== currentVal && value.trim()) {
      saveMember(memberId, { [field]: value });
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="sm" />
        <span className="ml-2 text-sm text-gray-500">Loading team members...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {members.length} Member{members.length !== 1 ? 's' : ''}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addMember}
          disabled={savingId === 'new'}
        >
          {savingId === 'new' ? (
            <Spinner size="sm" className="mr-1.5" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          Add Member
        </Button>
      </div>

      {/* Empty state */}
      {members.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No team members yet. Click &ldquo;Add Member&rdquo; to get started.
          </p>
        </div>
      )}

      {/* Members list */}
      {members.map((member) => (
        <DragDropItem
          key={member.id}
          dragProps={getDragProps(member.id)}
          isDragging={isDragging(member.id)}
          isDragOver={isDragOver(member.id)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        >
          <div className="w-full">
            {/* Card header */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() =>
                  setExpandedId(expandedId === member.id ? null : member.id)
                }
                className="flex-1 flex items-center gap-2 text-left min-w-0"
              >
                {expandedId === member.id ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {member.name || 'New Member'}
                </span>
                {member.role && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    &mdash; {member.role}
                  </span>
                )}
                {savingId === member.id && (
                  <Spinner size="sm" className="flex-shrink-0" />
                )}
              </button>
              <button
                type="button"
                onClick={() => removeMember(member)}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                title="Delete member"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Expanded editor */}
            {expandedId === member.id && (
              <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 space-y-4">
                {/* Photo */}
                <ImageUploadField
                  value={member.photo_url}
                  onChange={(url) => {
                    updateMemberLocal(member.id, { photo_url: url });
                    saveMember(member.id, { photo_url: url });
                  }}
                  label="Photo"
                  placeholder="Upload team member photo"
                  folder="team-photos"
                />

                {/* Name + Role */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="Name"
                    required
                    error={getMemberError(member.id, 'name')}
                  >
                    <input
                      type="text"
                      value={member.name}
                      onChange={(e) =>
                        updateMemberLocal(member.id, { name: e.target.value })
                      }
                      onBlur={(e) => handleFieldBlur(member.id, 'name', e.target.value)}
                      placeholder="Full name"
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    />
                  </FormField>
                  <FormField
                    label="Role"
                    required
                    error={getMemberError(member.id, 'role')}
                  >
                    <input
                      type="text"
                      value={member.role}
                      onChange={(e) =>
                        updateMemberLocal(member.id, { role: e.target.value })
                      }
                      onBlur={(e) => handleFieldBlur(member.id, 'role', e.target.value)}
                      placeholder="e.g. Lead Detailer"
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    />
                  </FormField>
                </div>

                {/* Bio */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Bio
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAiGenerateBio(member)}
                      disabled={aiLoadingId === member.id || !member.name.trim() || !member.role.trim()}
                      className="h-7 text-xs"
                    >
                      {aiLoadingId === member.id ? (
                        <Spinner size="sm" className="mr-1" />
                      ) : (
                        <Sparkles className="mr-1 h-3 w-3" />
                      )}
                      AI Generate Bio
                    </Button>
                  </div>
                  <PageHtmlEditor
                    value={member.bio}
                    onChange={(val) => updateMemberLocal(member.id, { bio: val })}
                    pageTitle={`${member.name || 'Team Member'} Bio`}
                    placeholder="Write a bio for this team member..."
                    rows={8}
                  />
                  <div className="flex justify-end mt-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => saveMember(member.id, { bio: member.bio })}
                      disabled={savingId === member.id}
                    >
                      {savingId === member.id ? (
                        <>
                          <Spinner size="sm" className="mr-1" />
                          Saving...
                        </>
                      ) : (
                        'Save Bio'
                      )}
                    </Button>
                  </div>
                </div>

                {/* Years of Service */}
                <FormField label="Years of Service" description="Optional">
                  <input
                    type="number"
                    value={member.years_of_service ?? ''}
                    onChange={(e) =>
                      updateMemberLocal(member.id, {
                        years_of_service: e.target.value
                          ? parseInt(e.target.value, 10)
                          : null,
                      })
                    }
                    onBlur={(e) => {
                      const val = e.target.value ? parseInt(e.target.value, 10) : null;
                      saveMember(member.id, { years_of_service: val });
                    }}
                    min={0}
                    placeholder="e.g. 5"
                    className="block w-32 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  />
                </FormField>

                {/* Certifications */}
                <CertificationsInput
                  value={member.certifications}
                  onChange={(certs) => {
                    updateMemberLocal(member.id, { certifications: certs });
                    saveMember(member.id, { certifications: certs });
                  }}
                />

                {/* Slug (read-only) */}
                {member.slug && (
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    URL slug: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">/team/{member.slug}</code>
                  </div>
                )}
              </div>
            )}
          </div>
        </DragDropItem>
      ))}

      {/* Add button at bottom */}
      {members.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addMember}
          disabled={savingId === 'new'}
          className="w-full"
        >
          {savingId === 'new' ? (
            <Spinner size="sm" className="mr-1.5" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          Add Member
        </Button>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CertificationsInput — tag-style input for certifications
// ---------------------------------------------------------------------------

function CertificationsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (certs: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  const addCert = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setInputValue('');
      return;
    }
    onChange([...value, trimmed]);
    setInputValue('');
  };

  const removeCert = (cert: string) => {
    onChange(value.filter((c) => c !== cert));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCert();
    }
  };

  return (
    <FormField label="Certifications" description="Optional — e.g. Ceramic Pro Certified, IDA Member">
      <div className="space-y-2">
        {/* Tags */}
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {value.map((cert) => (
              <span
                key={cert}
                className="inline-flex items-center gap-1 rounded-full bg-lime/10 border border-lime/20 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300"
              >
                {cert}
                <button
                  type="button"
                  onClick={() => removeCert(cert)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {/* Input + Add */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add certification..."
            className="block flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCert}
            disabled={!inputValue.trim()}
          >
            Add
          </Button>
        </div>
      </div>
    </FormField>
  );
}
