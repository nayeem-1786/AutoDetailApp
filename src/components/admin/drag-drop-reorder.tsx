'use client';

import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// DragDropItem — wrapper component for draggable items
// ---------------------------------------------------------------------------

interface DragDropItemProps {
  /** Props from useDragDropReorder().getDragProps(id) */
  dragProps: {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    onDrop: (e: React.DragEvent) => void;
  };
  isDragging: boolean;
  isDragOver: boolean;
  /** Show up/down buttons for keyboard/accessibility reordering */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function DragDropItem({
  dragProps,
  isDragging,
  isDragOver,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  className,
  children,
}: DragDropItemProps) {
  return (
    <div
      {...dragProps}
      className={cn(
        'relative transition-all',
        isDragging && 'opacity-50',
        isDragOver && 'ring-2 ring-blue-500 ring-offset-1',
        className
      )}
    >
      <div className="flex items-start gap-1">
        {/* Drag handle + arrow buttons */}
        <div className="flex flex-col items-center pt-2.5 flex-shrink-0">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          {(onMoveUp || onMoveDown) && (
            <div className="flex flex-col -mt-0.5">
              <button
                type="button"
                onClick={onMoveUp}
                disabled={isFirst}
                className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move up"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={isLast}
                className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move down"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
