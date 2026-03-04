'use client';

import { useState, useCallback } from 'react';
import { BlockPalette } from './block-palette';
import { BlockCanvas } from './block-canvas';
import { BlockProperties } from './block-properties';
import type { EmailBlock, EmailBlockType } from '@/lib/email/types';
import type { VariableDefinition } from '@/lib/email/variables';

/** Default data for each block type */
function defaultBlockData(type: EmailBlockType): Record<string, unknown> {
  switch (type) {
    case 'text':
      return { content: '', align: 'left' };
    case 'heading':
      return { text: '', level: 2, align: 'left' };
    case 'button':
      return { text: 'Click Here', url: '', color: 'primary', align: 'center' };
    case 'image':
      return { src: '', alt: '', width: 560 };
    case 'photo_gallery':
      return { mode: 'manual', pairs: [], gallery_link: true };
    case 'coupon':
      return { heading: 'Your Exclusive Offer', code_variable: '{coupon_code}', description: '', style: 'card' };
    case 'divider':
      return { style: 'solid', color: '#cccccc' };
    case 'spacer':
      return { height: 20 };
    case 'social_links':
      return { use_brand_kit: true };
    case 'two_column':
      return { left: [], right: [] };
    default:
      return {};
  }
}

function generateId(): string {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

interface EmailBlockEditorProps {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  variables: VariableDefinition[];
}

export function EmailBlockEditor({ blocks, onChange, variables }: EmailBlockEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedBlock = selectedId ? blocks.find((b) => b.id === selectedId) || null : null;

  const handleAdd = useCallback(
    (type: EmailBlockType) => {
      const newBlock = {
        id: generateId(),
        type,
        data: defaultBlockData(type),
      } as unknown as EmailBlock;

      // Insert after selected block, or at end
      if (selectedId) {
        const idx = blocks.findIndex((b) => b.id === selectedId);
        const updated = [...blocks];
        updated.splice(idx + 1, 0, newBlock);
        onChange(updated);
      } else {
        onChange([...blocks, newBlock]);
      }
      setSelectedId(newBlock.id);
    },
    [blocks, onChange, selectedId]
  );

  const handleReorder = useCallback(
    (reordered: EmailBlock[]) => {
      onChange(reordered);
    },
    [onChange]
  );

  const handleDelete = useCallback(
    (id: string) => {
      onChange(blocks.filter((b) => b.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [blocks, onChange, selectedId]
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx === -1) return;
      const original = blocks[idx];
      const duplicate: EmailBlock = {
        ...original,
        id: generateId(),
        data: JSON.parse(JSON.stringify(original.data)),
      };
      const updated = [...blocks];
      updated.splice(idx + 1, 0, duplicate);
      onChange(updated);
      setSelectedId(duplicate.id);
    },
    [blocks, onChange]
  );

  const handleBlockChange = useCallback(
    (updatedBlock: EmailBlock) => {
      onChange(blocks.map((b) => (b.id === updatedBlock.id ? updatedBlock : b)));
    },
    [blocks, onChange]
  );

  return (
    <div className="flex h-full min-h-[500px] overflow-hidden rounded-lg border border-gray-200">
      {/* Left: Block Palette */}
      <div className="w-52 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50">
        <BlockPalette onAdd={handleAdd} />
      </div>

      {/* Center: Canvas */}
      <div className="flex-1 overflow-y-auto bg-white">
        <BlockCanvas
          blocks={blocks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onReorder={handleReorder}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
        />
      </div>

      {/* Right: Properties Panel */}
      <div className="w-72 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50">
        {selectedBlock ? (
          <BlockProperties
            block={selectedBlock}
            variables={variables}
            onChange={handleBlockChange}
          />
        ) : (
          <div className="flex items-center justify-center p-8">
            <p className="text-center text-xs text-gray-400">
              Select a block to edit its properties
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
