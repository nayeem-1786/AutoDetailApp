'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CategoryTabsProps {
  categories: { id: string; name: string }[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function CategoryTabs({
  categories,
  selected,
  onSelect,
}: CategoryTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(direction: 'left' | 'right') {
    scrollRef.current?.scrollBy({
      left: direction === 'left' ? -200 : 200,
      behavior: 'smooth',
    });
  }

  if (categories.length === 0) return null;

  return (
    <div className="relative flex items-center gap-1">
      <button
        onClick={() => scroll('left')}
        className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-none"
      >
        <button
          onClick={() => onSelect(null)}
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
            'min-h-[44px] min-w-[44px]',
            selected === null
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              'min-h-[44px] min-w-[44px]',
              selected === cat.id
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <button
        onClick={() => scroll('right')}
        className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
