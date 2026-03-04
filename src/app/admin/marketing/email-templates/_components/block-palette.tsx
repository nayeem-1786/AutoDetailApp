'use client';

import {
  Type,
  Heading,
  MousePointerClick,
  ImageIcon,
  Images,
  Ticket,
  Minus,
  ArrowUpDown,
  Share2,
  Columns2,
} from 'lucide-react';
import type { EmailBlockType } from '@/lib/email/types';

interface BlockTypeConfig {
  type: EmailBlockType;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const BLOCK_TYPES: BlockTypeConfig[] = [
  { type: 'heading', label: 'Heading', description: 'H1, H2, or H3 title', icon: <Heading className="h-4 w-4" /> },
  { type: 'text', label: 'Text', description: 'Rich text paragraph', icon: <Type className="h-4 w-4" /> },
  { type: 'button', label: 'Button', description: 'Call-to-action button', icon: <MousePointerClick className="h-4 w-4" /> },
  { type: 'image', label: 'Image', description: 'Single image with optional link', icon: <ImageIcon className="h-4 w-4" /> },
  { type: 'photo_gallery', label: 'Photo Gallery', description: 'Before/after photo pairs', icon: <Images className="h-4 w-4" /> },
  { type: 'coupon', label: 'Coupon', description: 'Coupon code display', icon: <Ticket className="h-4 w-4" /> },
  { type: 'divider', label: 'Divider', description: 'Horizontal line', icon: <Minus className="h-4 w-4" /> },
  { type: 'spacer', label: 'Spacer', description: 'Vertical space', icon: <ArrowUpDown className="h-4 w-4" /> },
  { type: 'social_links', label: 'Social Links', description: 'Social media icons', icon: <Share2 className="h-4 w-4" /> },
  { type: 'two_column', label: 'Two Column', description: '50/50 layout', icon: <Columns2 className="h-4 w-4" /> },
];

interface BlockPaletteProps {
  onAdd: (type: EmailBlockType) => void;
}

export function BlockPalette({ onAdd }: BlockPaletteProps) {
  return (
    <div className="space-y-1 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Blocks</p>
      {BLOCK_TYPES.map((block) => (
        <button
          key={block.type}
          type="button"
          onClick={() => onAdd(block.type)}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition hover:bg-gray-100"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-600">
            {block.icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800">{block.label}</p>
            <p className="truncate text-xs text-gray-400">{block.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
