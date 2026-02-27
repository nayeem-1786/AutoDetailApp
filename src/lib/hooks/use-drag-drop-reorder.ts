'use client';

import { useState, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// useDragDropReorder — generic drag-and-drop reorder hook (HTML5 DnD API)
// ---------------------------------------------------------------------------

interface DragDropItem {
  id: string;
}

interface DragProps {
  draggable: true;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
}

interface UseDragDropReorderOptions<T extends DragDropItem> {
  items: T[];
  onReorder: (reorderedItems: T[]) => void | Promise<void>;
}

export function useDragDropReorder<T extends DragDropItem>({
  items,
  onReorder,
}: UseDragDropReorderOptions<T>) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const previousItemsRef = useRef<T[]>([]);

  const getDragProps = useCallback(
    (itemId: string): DragProps => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setDragId(itemId);
        previousItemsRef.current = [...items];
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragId === null || dragId === itemId) return;
        setDragOverId(itemId);

        // Reorder optimistically during drag
        const dragIdx = items.findIndex((i) => i.id === dragId);
        const targetIdx = items.findIndex((i) => i.id === itemId);
        if (dragIdx === -1 || targetIdx === -1 || dragIdx === targetIdx) return;

        const reordered = [...items];
        const [moved] = reordered.splice(dragIdx, 1);
        reordered.splice(targetIdx, 0, moved);
        onReorder(reordered);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
      },
      onDragEnd: () => {
        setDragId(null);
        setDragOverId(null);
      },
    }),
    [items, dragId, onReorder]
  );

  const isDragging = useCallback(
    (itemId: string): boolean => dragId === itemId,
    [dragId]
  );

  const isDragOver = useCallback(
    (itemId: string): boolean => dragOverId === itemId,
    [dragOverId]
  );

  return { getDragProps, isDragging, isDragOver, dragId };
}
