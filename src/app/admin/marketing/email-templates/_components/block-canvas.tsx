'use client';

import { useState } from 'react';
import { GripVertical, Trash2, Copy, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { generateId, defaultBlockData } from './email-block-editor';
import { BLOCK_TYPES } from './block-palette';
import type { EmailBlock, EmailBlockType, TwoColumnBlockData } from '@/lib/email/types';

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

// Block types allowed inside columns (no nesting two_column)
const NESTABLE_TYPES = BLOCK_TYPES.filter(b => b.type !== 'two_column');

interface BlockCanvasProps {
  blocks: EmailBlock[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReorder: (blocks: EmailBlock[]) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onBlockChange: (updatedBlock: EmailBlock) => void;
}

export function BlockCanvas({
  blocks,
  selectedId,
  onSelect,
  onReorder,
  onDelete,
  onDuplicate,
  onBlockChange,
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

        // Two Column block renders expanded with nested columns
        if (block.type === 'two_column') {
          return (
            <TwoColumnCanvasBlock
              key={block.id}
              block={block}
              idx={idx}
              totalBlocks={blocks.length}
              isSelected={isSelected}
              selectedId={selectedId}
              dragIdx={dragIdx}
              onSelect={onSelect}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onBlockChange={onBlockChange}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onMoveBlock={moveBlock}
            />
          );
        }

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
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-300 active:cursor-grabbing" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {TYPE_LABELS[block.type] || block.type}
                </span>
              </div>
              <BlockPreviewText block={block} />
            </div>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
              <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); moveBlock(idx, 'up'); }} disabled={idx === 0} className="h-6 w-6 p-0">
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); moveBlock(idx, 'down'); }} disabled={idx === blocks.length - 1} className="h-6 w-6 p-0">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDuplicate(block.id); }} className="h-6 w-6 p-0">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(block.id); }} className="h-6 w-6 p-0 text-red-400 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Two Column Canvas Block ────────────────────────────────

interface TwoColumnCanvasBlockProps {
  block: EmailBlock;
  idx: number;
  totalBlocks: number;
  isSelected: boolean;
  selectedId: string | null;
  dragIdx: number | null;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onBlockChange: (updatedBlock: EmailBlock) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDragEnd: () => void;
  onMoveBlock: (idx: number, direction: 'up' | 'down') => void;
}

function TwoColumnCanvasBlock({
  block,
  idx,
  totalBlocks,
  isSelected,
  selectedId,
  dragIdx,
  onSelect,
  onDelete,
  onDuplicate,
  onBlockChange,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMoveBlock,
}: TwoColumnCanvasBlockProps) {
  const tcData = block.data as TwoColumnBlockData;
  const [addTypeLeft, setAddTypeLeft] = useState('');
  const [addTypeRight, setAddTypeRight] = useState('');

  // Check if any nested block is selected
  const hasNestedSelection = tcData.left.some(b => b.id === selectedId) || tcData.right.some(b => b.id === selectedId);

  function updateColumn(col: 'left' | 'right', updatedBlocks: EmailBlock[]) {
    onBlockChange({ ...block, data: { ...tcData, [col]: updatedBlocks } } as EmailBlock);
  }

  function handleAddToColumn(col: 'left' | 'right', type: string) {
    if (!type) return;
    const newBlock = { id: generateId(), type: type as EmailBlockType, data: defaultBlockData(type as EmailBlockType) } as unknown as EmailBlock;
    updateColumn(col, [...tcData[col], newBlock]);
    onSelect(newBlock.id);
    if (col === 'left') setAddTypeLeft('');
    else setAddTypeRight('');
  }

  function handleDeleteNested(col: 'left' | 'right', id: string) {
    updateColumn(col, tcData[col].filter(b => b.id !== id));
    if (selectedId === id) onSelect(block.id);
  }

  function handleMoveNested(col: 'left' | 'right', nestedIdx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? nestedIdx - 1 : nestedIdx + 1;
    const colBlocks = tcData[col];
    if (targetIdx < 0 || targetIdx >= colBlocks.length) return;
    const reordered = [...colBlocks];
    [reordered[nestedIdx], reordered[targetIdx]] = [reordered[targetIdx], reordered[nestedIdx]];
    updateColumn(col, reordered);
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(idx)}
      onDragOver={(e) => onDragOver(e, idx)}
      onDragEnd={onDragEnd}
      className={`rounded-lg border-2 transition ${
        isSelected || hasNestedSelection
          ? 'border-blue-500'
          : dragIdx === idx
          ? 'border-blue-300 opacity-60'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Header bar */}
      <div
        onClick={() => onSelect(block.id)}
        className={`group flex cursor-pointer items-center gap-2 rounded-t-md px-3 py-2 ${
          isSelected ? 'bg-blue-50' : 'bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-300 active:cursor-grabbing" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Two Column</span>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onMoveBlock(idx, 'up'); }} disabled={idx === 0} className="h-6 w-6 p-0">
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onMoveBlock(idx, 'down'); }} disabled={idx === totalBlocks - 1} className="h-6 w-6 p-0">
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDuplicate(block.id); }} className="h-6 w-6 p-0">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(block.id); }} className="h-6 w-6 p-0 text-red-400 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Two columns side by side */}
      <div className="flex gap-2 p-3">
        <ColumnZone
          label="Left"
          blocks={tcData.left}
          selectedId={selectedId}
          addType={addTypeLeft}
          onAddTypeChange={setAddTypeLeft}
          onAdd={(type) => handleAddToColumn('left', type)}
          onSelect={onSelect}
          onDelete={(id) => handleDeleteNested('left', id)}
          onMove={(i, dir) => handleMoveNested('left', i, dir)}
        />
        <ColumnZone
          label="Right"
          blocks={tcData.right}
          selectedId={selectedId}
          addType={addTypeRight}
          onAddTypeChange={setAddTypeRight}
          onAdd={(type) => handleAddToColumn('right', type)}
          onSelect={onSelect}
          onDelete={(id) => handleDeleteNested('right', id)}
          onMove={(i, dir) => handleMoveNested('right', i, dir)}
        />
      </div>
    </div>
  );
}

// ─── Column Zone ────────────────────────────────────────────

function ColumnZone({
  label,
  blocks,
  selectedId,
  addType,
  onAddTypeChange,
  onAdd,
  onSelect,
  onDelete,
  onMove,
}: {
  label: string;
  blocks: EmailBlock[];
  selectedId: string | null;
  addType: string;
  onAddTypeChange: (v: string) => void;
  onAdd: (type: string) => void;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onMove: (idx: number, direction: 'up' | 'down') => void;
}) {
  return (
    <div className="flex-1 rounded-md border border-dashed border-gray-300 bg-gray-50/50 p-2">
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {label} ({blocks.length})
      </p>

      {/* Nested block list */}
      {blocks.length === 0 ? (
        <div className="mb-2 rounded border border-dashed border-gray-200 px-2 py-3 text-center text-[10px] text-gray-400">
          Empty
        </div>
      ) : (
        <div className="mb-2 space-y-1">
          {blocks.map((nested, nIdx) => (
            <div
              key={nested.id}
              onClick={(e) => { e.stopPropagation(); onSelect(nested.id); }}
              className={`group/nested flex cursor-pointer items-center gap-1 rounded border px-2 py-1.5 text-xs transition ${
                selectedId === nested.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium text-gray-600">
                  {TYPE_LABELS[nested.type] || nested.type}
                </span>
                <NestedPreviewText block={nested} />
              </div>
              <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover/nested:opacity-100">
                <button type="button" onClick={(e) => { e.stopPropagation(); onMove(nIdx, 'up'); }} disabled={nIdx === 0} className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onMove(nIdx, 'down'); }} disabled={nIdx === blocks.length - 1} className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(nested.id); }} className="rounded p-0.5 text-red-400 hover:text-red-600">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add block */}
      <div className="flex gap-1">
        <Select value={addType} onChange={(e) => onAddTypeChange(e.target.value)} className="flex-1 text-[11px]">
          <option value="">+ Add...</option>
          {NESTABLE_TYPES.map(b => (
            <option key={b.type} value={b.type}>{b.label}</option>
          ))}
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={() => onAdd(addType)} disabled={!addType} className="h-8 w-8 shrink-0 p-0">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Preview helpers ────────────────────────────────────────

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
    case 'two_column': {
      const tcLeft = (data.left as unknown[] | undefined) || [];
      const tcRight = (data.right as unknown[] | undefined) || [];
      preview = `Left: ${tcLeft.length} | Right: ${tcRight.length} blocks`;
      break;
    }
  }

  if (!preview) return null;
  return <p className="truncate text-xs text-gray-500">{preview}</p>;
}

function NestedPreviewText({ block }: { block: EmailBlock }) {
  const data = block.data as unknown as Record<string, unknown>;
  let text = '';
  switch (block.type) {
    case 'text': text = truncate(String(data.content || ''), 30); break;
    case 'heading': text = truncate(String(data.text || ''), 30); break;
    case 'button': text = String(data.text || ''); break;
    case 'image': text = String(data.alt || 'Image'); break;
    case 'coupon': text = String(data.heading || 'Coupon'); break;
    case 'divider': text = `${data.style || 'solid'}`; break;
    case 'spacer': text = `${data.height || 20}px`; break;
  }
  if (!text) return null;
  return <p className="truncate text-gray-400">{text}</p>;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}
