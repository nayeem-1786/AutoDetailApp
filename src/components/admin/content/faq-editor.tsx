'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// ---------------------------------------------------------------------------
// FAQ Editor — specialized Q&A pair editor
// ---------------------------------------------------------------------------

export interface FaqItem {
  question: string;
  answer: string;
}

interface FaqEditorProps {
  items: FaqItem[];
  onChange: (items: FaqItem[]) => void;
  onAiGenerate?: () => void;
  aiLoading?: boolean;
}

export function FaqEditor({
  items,
  onChange,
  onAiGenerate,
  aiLoading,
}: FaqEditorProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const addItem = () => {
    onChange([...items, { question: '', answer: '' }]);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: 'question' | 'answer', value: string) => {
    onChange(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;

    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    onChange(reordered);
    setDragIdx(idx);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  return (
    <div className="space-y-3">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {items.length} Question{items.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          {onAiGenerate && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAiGenerate}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <Spinner size="sm" className="mr-1.5" />
              ) : (
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Generate FAQs
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Question
          </Button>
        </div>
      </div>

      {/* FAQ items */}
      {items.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No FAQ items yet. Add questions or use AI to generate them.
          </p>
        </div>
      )}

      {items.map((item, idx) => (
        <div
          key={idx}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDragEnd={handleDragEnd}
          className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 ${
            dragIdx === idx ? 'opacity-50' : ''
          }`}
        >
          <div className="flex items-start gap-3">
            {/* Drag handle */}
            <button
              type="button"
              className="mt-2 cursor-grab text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
            >
              <GripVertical className="h-4 w-4" />
            </button>

            <div className="flex-1 space-y-2">
              {/* Question */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Q{idx + 1}
                </label>
                <input
                  type="text"
                  value={item.question}
                  onChange={(e) => updateItem(idx, 'question', e.target.value)}
                  placeholder="Enter question..."
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                />
              </div>

              {/* Answer */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Answer
                </label>
                <textarea
                  value={item.answer}
                  onChange={(e) => updateItem(idx, 'answer', e.target.value)}
                  placeholder="Enter answer..."
                  rows={3}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                />
              </div>
            </div>

            {/* Delete */}
            <button
              type="button"
              onClick={() => removeItem(idx)}
              className="mt-2 p-1 text-gray-400 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Parse FAQ JSON content string into FaqItem array.
 */
export function parseFaqContent(content: string): FaqItem[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item: unknown) =>
          typeof item === 'object' &&
          item !== null &&
          'question' in item &&
          'answer' in item
      ) as FaqItem[];
    }
  } catch {
    // fallback
  }
  return [];
}

/**
 * Serialize FaqItem array to JSON string.
 */
export function serializeFaqContent(items: FaqItem[]): string {
  return JSON.stringify(items.filter((i) => i.question.trim() || i.answer.trim()));
}
