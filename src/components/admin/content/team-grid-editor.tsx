'use client';

import { useState, useCallback } from 'react';
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
import { adminFetch } from '@/lib/utils/admin-fetch';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// TeamGridEditor — manages team_grid block content
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
}

interface TeamGridEditorProps {
  value: TeamGridMember[];
  onChange: (members: TeamGridMember[]) => void;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateId(): string {
  return crypto.randomUUID();
}

export function TeamGridEditor({ value, onChange }: TeamGridEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);

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
        updateMember(member.id, { bio: json.data.content });
        toast.success('Bio generated');
      }
    } catch {
      toast.error('Failed to generate bio');
    } finally {
      setAiLoadingId(null);
    }
  };

  const handleReorder = useCallback(
    (reordered: TeamGridMember[]) => {
      onChange(reordered.map((m, i) => ({ ...m, sort_order: i })));
    },
    [onChange]
  );

  const { getDragProps, isDragging, isDragOver } = useDragDropReorder({
    items: value,
    onReorder: handleReorder,
  });

  const addMember = () => {
    const newMember: TeamGridMember = {
      id: generateId(),
      name: '',
      role: '',
      bio: '',
      photo_url: '',
      slug: '',
      years_of_service: null,
      certifications: [],
      sort_order: value.length,
    };
    onChange([...value, newMember]);
    setExpandedId(newMember.id);
  };

  const removeMember = (id: string) => {
    if (!confirm('Remove this team member?')) return;
    onChange(value.filter((m) => m.id !== id).map((m, i) => ({ ...m, sort_order: i })));
    if (expandedId === id) setExpandedId(null);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateMember = (id: string, updates: Partial<TeamGridMember>) => {
    onChange(
      value.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, ...updates };
        // Auto-generate slug from name
        if ('name' in updates) {
          updated.slug = generateSlug(updates.name || '');
        }
        return updated;
      })
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

  const getMemberError = (memberId: string, field: string): string | undefined => {
    return errors[memberId]?.[field];
  };

  // Validate on blur
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

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {value.length} Member{value.length !== 1 ? 's' : ''}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={addMember}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Member
        </Button>
      </div>

      {/* Empty state */}
      {value.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No team members yet. Click &ldquo;Add Member&rdquo; to get started.
          </p>
        </div>
      )}

      {/* Members list */}
      {value.map((member, idx) => (
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
              </button>
              <button
                type="button"
                onClick={() => removeMember(member.id)}
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
                  onChange={(url) => updateMember(member.id, { photo_url: url })}
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
                        updateMember(member.id, { name: e.target.value })
                      }
                      onBlur={(e) => validateField(member.id, 'name', e.target.value)}
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
                        updateMember(member.id, { role: e.target.value })
                      }
                      onBlur={(e) => validateField(member.id, 'role', e.target.value)}
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
                    onChange={(val) => updateMember(member.id, { bio: val })}
                    pageTitle={`${member.name || 'Team Member'} Bio`}
                    placeholder="Write a bio for this team member..."
                    rows={8}
                  />
                </div>

                {/* Years of Service */}
                <FormField label="Years of Service" description="Optional">
                  <input
                    type="number"
                    value={member.years_of_service ?? ''}
                    onChange={(e) =>
                      updateMember(member.id, {
                        years_of_service: e.target.value
                          ? parseInt(e.target.value, 10)
                          : null,
                      })
                    }
                    min={0}
                    placeholder="e.g. 5"
                    className="block w-32 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  />
                </FormField>

                {/* Certifications */}
                <CertificationsInput
                  value={member.certifications}
                  onChange={(certs) =>
                    updateMember(member.id, { certifications: certs })
                  }
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
      {value.length > 0 && (
        <Button type="button" variant="outline" size="sm" onClick={addMember} className="w-full">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Member
        </Button>
      )}
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

// ---------------------------------------------------------------------------
// Parse / Serialize helpers
// ---------------------------------------------------------------------------

export function parseTeamGridContent(content: string): TeamGridMember[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.map((item: Partial<TeamGridMember>, i: number) => ({
        id: item.id || generateId(),
        name: item.name || '',
        role: item.role || '',
        bio: item.bio || '',
        photo_url: item.photo_url || '',
        slug: item.slug || generateSlug(item.name || ''),
        years_of_service: item.years_of_service ?? null,
        certifications: Array.isArray(item.certifications) ? item.certifications : [],
        sort_order: item.sort_order ?? i,
      }));
    }
  } catch {
    // fallback
  }
  return [];
}

export function serializeTeamGridContent(members: TeamGridMember[]): string {
  return JSON.stringify(
    members
      .filter((m) => m.name.trim())
      .map((m, i) => ({ ...m, sort_order: i }))
  );
}

export function validateTeamGridContent(members: TeamGridMember[]): boolean {
  return members.every((m) => !m.name.trim() || (m.name.trim() && m.role.trim()));
}
