'use client';

import { cn } from '@/lib/utils/cn';

interface CategoryTileProps {
  name: string;
  itemCount: number;
  imageUrl?: string | null;
  onClick: () => void;
}

export function CategoryTile({ name, itemCount, imageUrl, onClick }: CategoryTileProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex flex-col justify-end overflow-hidden rounded-xl text-left transition-all',
        'min-h-[120px] active:scale-[0.98]',
        'hover:shadow-md'
      )}
    >
      {/* Background */}
      {imageUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
      ) : (
        <div className="absolute inset-0 bg-gray-800" />
      )}

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

      {/* Content */}
      <div className="relative p-3">
        <span className="block text-sm font-semibold text-white">{name}</span>
        <span className="block text-xs text-gray-300">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
      </div>
    </button>
  );
}
