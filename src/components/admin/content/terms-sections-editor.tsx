'use client';

import { useState, useCallback } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Sparkles,
  ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { PageHtmlEditor } from './page-html-editor';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/utils/admin-fetch';

// ---------------------------------------------------------------------------
// Terms Sections Editor — manages terms & conditions sections
// ---------------------------------------------------------------------------

export interface TermsSection {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  sort_order: number;
}

export interface TermsSectionsContent {
  effective_date: string | null;
  sections: TermsSection[];
}

interface TermsSectionsEditorProps {
  content: string;
  onChange: (value: string) => void;
  pagePath?: string;
  pageType?: string;
}

const DEFAULT_SECTIONS: Omit<TermsSection, 'id' | 'sort_order'>[] = [
  { title: 'Service Agreement & Liability', content: '', is_active: true },
  { title: 'Payment Terms', content: '', is_active: true },
  { title: 'Cancellation & No-Show Policy', content: '', is_active: true },
  { title: 'SMS & Text Message Consent', content: '', is_active: true },
  { title: 'Email Communications', content: '', is_active: true },
  { title: 'Photo Documentation & Usage', content: '', is_active: true },
  { title: 'Warranty & Service Guarantees', content: '', is_active: true },
  { title: 'Mobile / On-Location Service', content: '', is_active: true },
  { title: 'General Terms', content: '', is_active: true },
];

function parseTermsContent(raw: string): TermsSectionsContent {
  try {
    const parsed = JSON.parse(raw);
    // Handle legacy format: plain array of sections
    if (Array.isArray(parsed)) {
      return { effective_date: null, sections: parsed };
    }
    // New format: { effective_date, sections }
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        effective_date: parsed.effective_date ?? null,
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      };
    }
  } catch {
    // empty
  }
  return { effective_date: null, sections: [] };
}

function serializeTermsContent(data: TermsSectionsContent): string {
  return JSON.stringify(data);
}

export function TermsSectionsEditor({
  content,
  onChange,
  pagePath,
  pageType,
}: TermsSectionsEditorProps) {
  const data = parseTermsContent(content);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);
  const { confirm, dialogProps, ConfirmDialog } = useConfirmDialog();

  const updateData = useCallback(
    (updater: (prev: TermsSectionsContent) => TermsSectionsContent) => {
      const current = parseTermsContent(content);
      const next = updater(current);
      onChange(serializeTermsContent(next));
    },
    [content, onChange]
  );

  // -------------------------------------------------------------------------
  // Effective date
  // -------------------------------------------------------------------------

  const handleDateChange = (dateStr: string) => {
    updateData((prev) => ({ ...prev, effective_date: dateStr || null }));
  };

  // -------------------------------------------------------------------------
  // Section CRUD
  // -------------------------------------------------------------------------

  const handleAddSection = () => {
    const newSection: TermsSection = {
      id: crypto.randomUUID(),
      title: '',
      content: '',
      is_active: true,
      sort_order: data.sections.length,
    };
    updateData((prev) => ({
      ...prev,
      sections: [...prev.sections, newSection],
    }));
    setExpandedId(newSection.id);
  };

  const handleDeleteSection = (id: string) => {
    const section = data.sections.find((s) => s.id === id);
    confirm({
      title: 'Delete Section',
      description: `Delete "${section?.title || 'this section'}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: () => {
        updateData((prev) => ({
          ...prev,
          sections: prev.sections
            .filter((s) => s.id !== id)
            .map((s, i) => ({ ...s, sort_order: i })),
        }));
        if (expandedId === id) setExpandedId(null);
      },
    });
  };

  const handleUpdateSection = (id: string, updates: Partial<TermsSection>) => {
    updateData((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    }));
  };

  const handleToggleActive = (id: string) => {
    updateData((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === id ? { ...s, is_active: !s.is_active } : s
      ),
    }));
  };

  // -------------------------------------------------------------------------
  // Generate Default Sections
  // -------------------------------------------------------------------------

  const handleGenerateDefaults = () => {
    confirm({
      title: 'Generate Default Sections',
      description: 'This will add 9 default T&C sections. Continue?',
      confirmLabel: 'Generate',
      variant: 'default',
      onConfirm: () => {
        const sections = DEFAULT_SECTIONS.map((s, i) => ({
          ...s,
          id: crypto.randomUUID(),
          sort_order: i,
        }));
        updateData((prev) => ({ ...prev, sections }));
      },
    });
  };

  // -------------------------------------------------------------------------
  // AI Generate Section Content
  // -------------------------------------------------------------------------

  const handleAiGenerateSection = async (section: TermsSection) => {
    if (!section.title.trim()) {
      toast.error('Enter a section title first');
      return;
    }
    setAiLoadingId(section.id);
    try {
      const res = await adminFetch('/api/admin/cms/content/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'terms_section',
          pagePath: pagePath || '/terms',
          pageType: pageType || 'terms',
          sectionTitle: section.title,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'AI generation failed');
      }

      const json = await res.json();
      const generatedContent = json.data?.content;
      if (generatedContent) {
        handleUpdateSection(section.id, { content: generatedContent });
        toast.success('Section content generated');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setAiLoadingId(null);
    }
  };

  // -------------------------------------------------------------------------
  // Drag & Drop
  // -------------------------------------------------------------------------

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;

    updateData((prev) => {
      const reordered = [...prev.sections];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(idx, 0, moved);
      return {
        ...prev,
        sections: reordered.map((s, i) => ({ ...s, sort_order: i })),
      };
    });
    setDragIdx(idx);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  // -------------------------------------------------------------------------
  // Active section numbering (sequential among active only)
  // -------------------------------------------------------------------------

  const activeSectionNumbers = new Map<string, number>();
  let activeCount = 0;
  for (const section of data.sections) {
    if (section.is_active) {
      activeCount++;
      activeSectionNumbers.set(section.id, activeCount);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Effective Date */}
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Effective Date
        </label>
        <input
          type="date"
          value={data.effective_date || ''}
          onChange={(e) => handleDateChange(e.target.value)}
          className="block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
        />
      </div>

      {/* Generate Default Sections button — only when empty */}
      {data.sections.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            No sections yet. Start with the 9 default T&C sections or add sections manually.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleGenerateDefaults}>
              <ListChecks className="mr-1.5 h-3.5 w-3.5" />
              Generate Default Sections
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleAddSection}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Section
            </Button>
          </div>
        </div>
      )}

      {/* Sections list */}
      {data.sections.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {data.sections.length} Section{data.sections.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-2">
            {data.sections.map((section, idx) => {
              const isExpanded = expandedId === section.id;
              const isAiLoading = aiLoadingId === section.id;
              const sectionNum = activeSectionNumbers.get(section.id);

              return (
                <div
                  key={section.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-opacity ${
                    dragIdx === idx ? 'opacity-50' : ''
                  } ${!section.is_active ? 'opacity-60' : ''}`}
                >
                  {/* Card Header */}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button
                      type="button"
                      className="cursor-grab text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : section.id)}
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      )}
                      {sectionNum !== undefined && (
                        <span className="text-xs font-mono text-gray-400 flex-shrink-0">
                          {sectionNum}.
                        </span>
                      )}
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {section.title || 'New Section'}
                      </span>
                    </button>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={section.is_active}
                        onCheckedChange={() => handleToggleActive(section.id)}
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteSection(section.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete section"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 space-y-4">
                      {/* Title */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Section Title <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={section.title}
                          onChange={(e) =>
                            handleUpdateSection(section.id, { title: e.target.value })
                          }
                          placeholder="e.g. Service Agreement"
                          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                        />
                        {!section.title.trim() && (
                          <p className="mt-1 text-xs text-red-400">Title is required</p>
                        )}
                      </div>

                      {/* Content — HTML Editor */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                            Content
                          </label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAiGenerateSection(section)}
                            disabled={isAiLoading || !section.title.trim()}
                            className="h-7 text-xs"
                          >
                            {isAiLoading ? (
                              <Spinner size="sm" className="mr-1" />
                            ) : (
                              <Sparkles className="mr-1 h-3 w-3" />
                            )}
                            AI Generate Section
                          </Button>
                        </div>
                        <PageHtmlEditor
                          value={section.content}
                          onChange={(val) =>
                            handleUpdateSection(section.id, { content: val })
                          }
                          rows={8}
                          placeholder="Write the terms section content..."
                        />
                        {!section.content.trim() && (
                          <p className="mt-1 text-xs text-amber-500">
                            Content is empty — consider adding terms text
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Section button */}
          <Button type="button" variant="outline" size="sm" onClick={handleAddSection}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Section
          </Button>
        </>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
