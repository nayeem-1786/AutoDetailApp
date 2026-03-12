'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Before',
  afterLabel = 'After',
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track container width for before-image sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.offsetWidth);

    return () => observer.disconnect();
  }, []);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl cursor-col-resize select-none group"
      style={{ touchAction: 'none' }}
      role="slider"
      aria-valuenow={Math.round(position)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Before and after comparison slider"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') setPosition((p) => Math.max(0, p - 2));
        if (e.key === 'ArrowRight') setPosition((p) => Math.min(100, p + 2));
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        setIsDragging(true);
        updatePosition(e.clientX);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (isDragging) updatePosition(e.clientX);
      }}
      onPointerUp={() => setIsDragging(false)}
      onPointerCancel={() => setIsDragging(false)}
    >
      {/* After image (full width, bottom layer) */}
      <img
        src={afterSrc}
        alt={afterLabel}
        className="block w-full"
        draggable={false}
      />

      {/* Before image (clipped by position) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        <img
          src={beforeSrc}
          alt={beforeLabel}
          className="block h-full max-w-none"
          style={{ width: `${containerWidth}px` }}
          draggable={false}
        />
      </div>

      {/* Divider */}
      <div
        className="absolute top-0 bottom-0 z-10"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        <div className="w-[3px] h-full bg-accent-brand" style={{ boxShadow: '0 0 20px rgba(204, 255, 0, 0.15)' }} />
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-black border-2 border-accent-brand flex items-center justify-center transition-transform ${
            isDragging ? 'scale-110' : 'group-hover:scale-105'
          }`}
          style={{ boxShadow: isDragging ? '0 0 40px rgba(204, 255, 0, 0.25)' : '0 0 20px rgba(204, 255, 0, 0.15)' }}
        >
          <div className="flex items-center gap-0.5">
            <svg className="w-3 h-3 text-accent-brand rotate-180" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
            </svg>
            <svg className="w-3 h-3 text-accent-brand" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Labels */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="absolute top-4 left-4 z-20 pointer-events-none"
      >
        <span className="bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full text-white text-xs font-bold uppercase tracking-wider">
          {beforeLabel}
        </span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="absolute top-4 right-4 z-20 pointer-events-none"
      >
        <span className="bg-accent-brand/90 backdrop-blur-sm px-3 py-1.5 rounded-full text-black text-xs font-bold uppercase tracking-wider">
          {afterLabel}
        </span>
      </motion.div>
    </div>
  );
}
