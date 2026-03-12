'use client';

import { useState, useRef, useCallback } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  AnimatePresence,
  type PanInfo,
} from 'framer-motion';
import { Trash2 } from 'lucide-react';

const SWIPE_THRESHOLD = 100;
const DELETE_SLIDE_DISTANCE = -400;

interface SwipeableCartItemProps {
  itemId: string;
  itemName: string;
  disabled?: boolean;
  onRemove: (itemId: string) => void;
  onUndo: (itemId: string) => void;
  children: React.ReactNode;
}

export function SwipeableCartItem({
  itemId,
  itemName: _itemName,
  disabled,
  onRemove,
  children,
}: SwipeableCartItemProps) {
  const x = useMotionValue(0);
  const [removing, setRemoving] = useState(false);
  const constraintsRef = useRef<HTMLDivElement>(null);

  // Red background opacity increases as user swipes left
  const deleteOpacity = useTransform(x, [-150, -60, 0], [1, 0.6, 0]);
  const deleteScale = useTransform(x, [-150, -60, 0], [1, 0.8, 0.5]);

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.x < -SWIPE_THRESHOLD) {
        setRemoving(true);
        onRemove(itemId);
      }
    },
    [itemId, onRemove]
  );

  if (removing) return null;

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden" ref={constraintsRef}>
      {/* Red delete background revealed on swipe */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end rounded-r bg-red-500 dark:bg-red-600 pr-4"
        style={{ opacity: deleteOpacity }}
        aria-hidden
      >
        <motion.div
          className="flex items-center gap-1.5"
          style={{ scale: deleteScale }}
        >
          <Trash2 className="h-4 w-4 text-white" />
          <span className="text-sm font-medium text-white">Delete</span>
        </motion.div>
      </motion.div>

      {/* Swipeable item content */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -150, right: 0 }}
        dragElastic={0.1}
        style={{ x }}
        onDragEnd={handleDragEnd}
        className="relative z-10 bg-white dark:bg-gray-900"
        aria-label="Swipe left to remove"
      >
        {children}
      </motion.div>
    </div>
  );
}

interface SwipeableCartListProps {
  children: React.ReactNode;
}

export function SwipeableCartList({ children }: SwipeableCartListProps) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {children}
    </AnimatePresence>
  );
}

// Wrapper for each item that provides the exit animation
export function SwipeableCartItemWrapper({
  itemId,
  children,
}: {
  itemId: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      key={itemId}
      layout
      initial={{ opacity: 1, height: 'auto' }}
      exit={{
        x: DELETE_SLIDE_DISTANCE,
        opacity: 0,
        height: 0,
        marginTop: 0,
        marginBottom: 0,
        paddingTop: 0,
        paddingBottom: 0,
        transition: {
          x: { duration: 0.25, ease: 'easeIn' },
          opacity: { duration: 0.2 },
          height: { duration: 0.2, delay: 0.1 },
        },
      }}
      transition={{ layout: { duration: 0.2 } }}
    >
      {children}
    </motion.div>
  );
}
