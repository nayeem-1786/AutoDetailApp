'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { generateId, defaultBlockData } from './email-block-editor';
import { BLOCK_TYPES } from './block-palette';
import {
  TextProperties,
  HeadingProperties,
  ButtonProperties,
  ImageProperties,
  PhotoGalleryProperties,
  CouponProperties,
  DividerProperties,
  SpacerProperties,
  SocialLinksProperties,
} from './block-properties';
import type {
  EmailBlock,
  EmailBlockType,
  TwoColumnBlockData,
  TextBlockData,
  HeadingBlockData,
  ButtonBlockData,
  ImageBlockData,
  PhotoGalleryBlockData,
  CouponBlockData,
  DividerBlockData,
  SpacerBlockData,
  SocialLinksBlockData,
} from '@/lib/email/types';
import type { VariableDefinition } from '@/lib/email/variables';

// Block types allowed inside columns (no nesting two_column)
const NESTABLE_TYPES = BLOCK_TYPES.filter(b => b.type !== 'two_column');

const TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  heading: 'Heading',
  button: 'Button',
  image: 'Image',
  photo_gallery: 'Gallery',
  coupon: 'Coupon',
  divider: 'Divider',
  spacer: 'Spacer',
  social_links: 'Social',
};

interface TwoColumnPropertiesProps {
  data: TwoColumnBlockData;
  variables: VariableDefinition[];
  onChange: (data: Partial<TwoColumnBlockData>) => void;
}

export function TwoColumnProperties({ data, variables, onChange }: TwoColumnPropertiesProps) {
  const [activeColumn, setActiveColumn] = useState<'left' | 'right'>('left');
  const [selectedNestedId, setSelectedNestedId] = useState<string | null>(null);
  const [addType, setAddType] = useState('');

  const blocks = data[activeColumn] || [];
  const selectedNested = selectedNestedId ? blocks.find(b => b.id === selectedNestedId) || null : null;

  function updateColumn(col: 'left' | 'right', updatedBlocks: EmailBlock[]) {
    onChange({ [col]: updatedBlocks });
  }

  function handleAdd() {
    if (!addType) return;
    const newBlock = {
      id: generateId(),
      type: addType as EmailBlockType,
      data: defaultBlockData(addType as EmailBlockType),
    } as unknown as EmailBlock;
    updateColumn(activeColumn, [...blocks, newBlock]);
    setSelectedNestedId(newBlock.id);
    setAddType('');
  }

  function handleDelete(id: string) {
    updateColumn(activeColumn, blocks.filter(b => b.id !== id));
    if (selectedNestedId === id) setSelectedNestedId(null);
  }

  function handleMoveUp(idx: number) {
    if (idx <= 0) return;
    const reordered = [...blocks];
    [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
    updateColumn(activeColumn, reordered);
  }

  function handleMoveDown(idx: number) {
    if (idx >= blocks.length - 1) return;
    const reordered = [...blocks];
    [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
    updateColumn(activeColumn, reordered);
  }

  function handleNestedChange(updatedBlock: EmailBlock) {
    updateColumn(activeColumn, blocks.map(b => b.id === updatedBlock.id ? updatedBlock : b));
  }

  function nestedUpdate(block: EmailBlock, partialData: Record<string, unknown>) {
    handleNestedChange({ ...block, data: { ...block.data, ...partialData } } as EmailBlock);
  }

  return (
    <div className="space-y-3">
      {/* Column tabs */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => { setActiveColumn('left'); setSelectedNestedId(null); }}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
            activeColumn === 'left'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Left ({data.left?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => { setActiveColumn('right'); setSelectedNestedId(null); }}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
            activeColumn === 'right'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Right ({data.right?.length || 0})
        </button>
      </div>

      {/* Mini block list */}
      {blocks.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-400">
          No blocks in {activeColumn} column
        </div>
      ) : (
        <div className="space-y-1">
          {blocks.map((block, idx) => (
            <div
              key={block.id}
              onClick={() => setSelectedNestedId(block.id)}
              className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1.5 text-xs transition ${
                selectedNestedId === block.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium text-gray-700">
                  {TYPE_LABELS[block.type] || block.type}
                </span>
                <NestedPreview block={block} />
              </div>
              <div className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleMoveUp(idx); }}
                  disabled={idx === 0}
                  className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleMoveDown(idx); }}
                  disabled={idx === blocks.length - 1}
                  className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(block.id); }}
                  className="rounded p-0.5 text-red-400 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add block */}
      <div className="flex gap-1">
        <Select
          value={addType}
          onChange={(e) => setAddType(e.target.value)}
          className="flex-1 text-xs"
        >
          <option value="">Add block...</option>
          {NESTABLE_TYPES.map(b => (
            <option key={b.type} value={b.type}>{b.label}</option>
          ))}
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={handleAdd} disabled={!addType} className="shrink-0">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Nested block properties */}
      {selectedNested && (
        <>
          <div className="border-t border-gray-200 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              {(selectedNested.type).replace(/_/g, ' ')} Properties
            </p>
            <div className="space-y-4">
              <NestedPropertyEditor
                block={selectedNested}
                variables={variables}
                onChange={(d) => nestedUpdate(selectedNested, d)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Renders the appropriate property editor for a nested block */
function NestedPropertyEditor({
  block,
  variables,
  onChange,
}: {
  block: EmailBlock;
  variables: VariableDefinition[];
  onChange: (d: Record<string, unknown>) => void;
}) {
  switch (block.type) {
    case 'text':
      return <TextProperties data={block.data as TextBlockData} variables={variables} onChange={onChange} />;
    case 'heading':
      return <HeadingProperties data={block.data as HeadingBlockData} onChange={onChange} />;
    case 'button':
      return <ButtonProperties data={block.data as ButtonBlockData} variables={variables} onChange={onChange} />;
    case 'image':
      return <ImageProperties data={block.data as ImageBlockData} onChange={onChange} />;
    case 'photo_gallery':
      return <PhotoGalleryProperties data={block.data as PhotoGalleryBlockData} onChange={onChange} />;
    case 'coupon':
      return <CouponProperties data={block.data as CouponBlockData} variables={variables} onChange={onChange} />;
    case 'divider':
      return <DividerProperties data={block.data as DividerBlockData} onChange={onChange} />;
    case 'spacer':
      return <SpacerProperties data={block.data as SpacerBlockData} onChange={onChange} />;
    case 'social_links':
      return <SocialLinksProperties data={block.data as SocialLinksBlockData} onChange={onChange} />;
    default:
      return <p className="text-xs text-gray-400">No properties available for this block type.</p>;
  }
}

/** Compact preview text for nested blocks */
function NestedPreview({ block }: { block: EmailBlock }) {
  const data = block.data as unknown as Record<string, unknown>;
  let text = '';

  switch (block.type) {
    case 'text':
      text = truncate(String(data.content || ''), 40);
      break;
    case 'heading':
      text = truncate(String(data.text || ''), 40);
      break;
    case 'button':
      text = String(data.text || '');
      break;
    case 'image':
      text = String(data.alt || 'Image');
      break;
    case 'coupon':
      text = String(data.heading || 'Coupon');
      break;
    case 'divider':
      text = `${data.style || 'solid'} line`;
      break;
    case 'spacer':
      text = `${data.height || 20}px`;
      break;
  }

  if (!text) return null;
  return <p className="truncate text-gray-400">{text}</p>;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}
