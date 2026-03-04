'use client';

import { useState } from 'react';
import { GripVertical, Trash2, Copy, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EmailBlock, EmailBlockType } from '@/lib/email/types';

const TYPE_LABELS: Record<EmailBlockType, string> = {
  text: 'Text',
  heading: 'Heading',
  button: 'Button',
  image: 'Image',
  photo_gallery: 'Photo Gallery',
  coupon: 'Coupon',
  divider: 'Divider',
  spacer: 'Spacer',
  social_links: 'Social Links',
  two_column: 'Two Column',
};

interface BlockCanvasProps {
  blocks: EmailBlock[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReorder: (blocks: EmailBlock[]) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export function BlockCanvas({
  blocks,
  selectedId,
  onSelect,
  onReorder,
  onDelete,
  onDuplicate,
}: BlockCanvasProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;

    const reordered = [...blocks];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    onReorder(reordered);
    setDragIdx(idx);
  }

  function handleDragEnd() {
    setDragIdx(null);
  }

  function moveBlock(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= blocks.length) return;
    const reordered = [...blocks];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    onReorder(reordered);
  }

  if (blocks.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-500">No blocks yet</p>
          <p className="mt-1 text-xs text-gray-400">Click a block type from the palette to add it</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      {blocks.map((block, idx) => {
        const isSelected = block.id === selectedId;
        return (
          <div
            key={block.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelect(block.id)}
            className={`group relative flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2.5 transition ${
              isSelected
                ? 'border-blue-500 bg-blue-50'
                : dragIdx === idx
                ? 'border-blue-300 bg-blue-50/50 opacity-60'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            {/* Drag handle */}
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-300 active:cursor-grabbing" />

            {/* Block label + preview */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {TYPE_LABELS[block.type] || block.type}
                </span>
              </div>
              <BlockPreviewText block={block} />
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); moveBlock(idx, 'up'); }}
                disabled={idx === 0}
                className="h-6 w-6 p-0"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); moveBlock(idx, 'down'); }}
                disabled={idx === blocks.length - 1}
                className="h-6 w-6 p-0"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onDuplicate(block.id); }}
                className="h-6 w-6 p-0"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
                className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Show a brief inline preview of block content */
function BlockPreviewText({ block }: { block: EmailBlock }) {
  const data = block.data as unknown as Record<string, unknown>;
  let preview = '';

  switch (block.type) {
    case 'text':
      preview = truncate(String(data.content || ''), 60);
      break;
    case 'heading':
      preview = truncate(String(data.text || ''), 60);
      break;
    case 'button':
      preview = `"${data.text}" → ${data.url || '(no link)'}`;
      break;
    case 'image':
      preview = String(data.alt || data.src || 'No image set');
      break;
    case 'photo_gallery': {
      const mode = data.mode as string;
      const pairs = data.pairs as unknown[] | undefined;
      preview = mode === 'dynamic' ? 'Dynamic gallery' : `${pairs?.length || 0} pair(s)`;
      break;
    }
    case 'coupon':
      preview = `${data.heading || 'Coupon'}: ${data.code_variable || ''}`;
      break;
    case 'divider':
      preview = `${data.style || 'solid'} line`;
      break;
    case 'spacer':
      preview = `${data.height || 20}px`;
      break;
    case 'social_links':
      preview = data.use_brand_kit ? 'From Brand Kit' : 'Custom links';
      break;
    case 'two_column':
      preview = '2-column layout';
      break;
  }

  if (!preview) return null;

  return <p className="truncate text-xs text-gray-500">{preview}</p>;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}
