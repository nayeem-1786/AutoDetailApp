'use client';

import { useState, useRef, useCallback } from 'react';
import { Circle, ArrowUpRight, Type, Undo2, Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Annotation } from '@/lib/utils/job-zones';
import { DEFAULT_ANNOTATION_COLOR } from '@/lib/utils/job-zones';

type AnnotationTool = 'circle' | 'arrow' | 'text' | null;

interface PhotoAnnotationProps {
  imageUrl: string;
  initialAnnotations?: Annotation[];
  onSave: (annotations: Annotation[]) => void;
  onCancel: () => void;
}

export function PhotoAnnotation({
  imageUrl,
  initialAnnotations = [],
  onSave,
  onCancel,
}: PhotoAnnotationProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [activeTool, setActiveTool] = useState<AnnotationTool>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const getRelativeCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: ((clientX - rect.left) / rect.width) * 100,
        y: ((clientY - rect.top) / rect.height) * 100,
      };
    },
    []
  );

  function handlePointerDown(e: React.PointerEvent) {
    if (!activeTool) return;
    e.preventDefault();
    const coords = getRelativeCoords(e.clientX, e.clientY);

    if (activeTool === 'text') {
      setPendingText(coords);
      setTextInput('');
      return;
    }

    if (activeTool === 'circle' || activeTool === 'arrow') {
      setDragStart(coords);
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    // For visual feedback during drag — not strictly needed since we finalize on pointerUp
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!activeTool || !dragStart) return;
    const end = getRelativeCoords(e.clientX, e.clientY);

    if (activeTool === 'circle') {
      const dx = end.x - dragStart.x;
      const dy = end.y - dragStart.y;
      const radius = Math.max(Math.sqrt(dx * dx + dy * dy), 2);
      setAnnotations((prev) => [
        ...prev,
        { type: 'circle', x: dragStart.x, y: dragStart.y, radius, color: DEFAULT_ANNOTATION_COLOR },
      ]);
    } else if (activeTool === 'arrow') {
      setAnnotations((prev) => [
        ...prev,
        {
          type: 'arrow',
          x1: dragStart.x,
          y1: dragStart.y,
          x2: end.x,
          y2: end.y,
          color: DEFAULT_ANNOTATION_COLOR,
        },
      ]);
    }

    setDragStart(null);
  }

  function handleTextSubmit() {
    if (!pendingText || !textInput.trim()) {
      setPendingText(null);
      setTextInput('');
      return;
    }
    setAnnotations((prev) => [
      ...prev,
      { type: 'text', x: pendingText.x, y: pendingText.y, label: textInput.trim(), color: DEFAULT_ANNOTATION_COLOR },
    ]);
    setPendingText(null);
    setTextInput('');
  }

  function handleUndo() {
    setAnnotations((prev) => prev.slice(0, -1));
  }

  function handleClearAll() {
    setAnnotations([]);
  }

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-gray-900 px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTool(activeTool === 'circle' ? null : 'circle')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium',
              activeTool === 'circle'
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            )}
          >
            <Circle className="h-4 w-4" />
            Circle
          </button>
          <button
            onClick={() => setActiveTool(activeTool === 'arrow' ? null : 'arrow')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium',
              activeTool === 'arrow'
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            )}
          >
            <ArrowUpRight className="h-4 w-4" />
            Arrow
          </button>
          <button
            onClick={() => setActiveTool(activeTool === 'text' ? null : 'text')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium',
              activeTool === 'text'
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            )}
          >
            <Type className="h-4 w-4" />
            Text
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleUndo}
            disabled={annotations.length === 0}
            className="rounded-lg bg-gray-700 px-2 py-2 text-gray-300 hover:bg-gray-600 disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleClearAll}
            disabled={annotations.length === 0}
            className="rounded-lg bg-gray-700 px-2 py-2 text-gray-300 hover:bg-gray-600 disabled:opacity-30"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Image + annotation overlay */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="relative mx-auto h-full w-full"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ touchAction: 'none' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Photo to annotate"
            className="h-full w-full object-contain"
            draggable={false}
          />

          {/* SVG overlay for annotations */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="10"
                refY="3.5"
                orient="auto"
                fill="#FF0000"
              >
                <polygon points="0 0, 10 3.5, 0 7" />
              </marker>
            </defs>
            {annotations.map((ann, i) => {
              if (ann.type === 'circle') {
                return (
                  <ellipse
                    key={i}
                    cx={ann.x}
                    cy={ann.y}
                    rx={ann.radius}
                    ry={ann.radius}
                    fill="none"
                    stroke={ann.color}
                    strokeWidth="0.4"
                  />
                );
              }
              if (ann.type === 'arrow') {
                return (
                  <line
                    key={i}
                    x1={ann.x1}
                    y1={ann.y1}
                    x2={ann.x2}
                    y2={ann.y2}
                    stroke={ann.color}
                    strokeWidth="0.4"
                    markerEnd="url(#arrowhead)"
                  />
                );
              }
              if (ann.type === 'text') {
                return (
                  <text
                    key={i}
                    x={ann.x}
                    y={ann.y}
                    fill={ann.color}
                    fontSize="3"
                    fontWeight="bold"
                    style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: '0.3px' }}
                  >
                    {ann.label}
                  </text>
                );
              }
              return null;
            })}
          </svg>
        </div>

        {/* Text input overlay */}
        {pendingText && (
          <div
            className="absolute z-10 flex items-center gap-1"
            style={{
              left: `${pendingText.x}%`,
              top: `${pendingText.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextSubmit();
                if (e.key === 'Escape') {
                  setPendingText(null);
                  setTextInput('');
                }
              }}
              placeholder="Label..."
              className="w-32 rounded border border-red-500 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleTextSubmit}
              className="rounded bg-red-600 p-1 text-white"
            >
              <Check className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Active tool hint */}
      {activeTool && (
        <div className="bg-gray-900 px-3 py-1.5 text-center text-xs text-gray-400">
          {activeTool === 'circle' && 'Tap and drag to draw a circle'}
          {activeTool === 'arrow' && 'Tap and drag to draw an arrow'}
          {activeTool === 'text' && 'Tap to place a text label'}
        </div>
      )}

      {/* Bottom action buttons */}
      <div className="flex gap-2 bg-gray-900 px-3 py-3">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(annotations)}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Done ({annotations.length})
        </button>
      </div>
    </div>
  );
}

/** Read-only annotation overlay for displaying annotations on photos */
export function AnnotationOverlay({ annotations }: { annotations: Annotation[] }) {
  if (!annotations || annotations.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <marker
          id="arrowhead-ro"
          markerWidth="10"
          markerHeight="7"
          refX="10"
          refY="3.5"
          orient="auto"
          fill="#FF0000"
        >
          <polygon points="0 0, 10 3.5, 0 7" />
        </marker>
      </defs>
      {annotations.map((ann, i) => {
        if (ann.type === 'circle') {
          return (
            <ellipse
              key={i}
              cx={ann.x}
              cy={ann.y}
              rx={ann.radius}
              ry={ann.radius}
              fill="none"
              stroke={ann.color}
              strokeWidth="0.4"
            />
          );
        }
        if (ann.type === 'arrow') {
          return (
            <line
              key={i}
              x1={ann.x1}
              y1={ann.y1}
              x2={ann.x2}
              y2={ann.y2}
              stroke={ann.color}
              strokeWidth="0.4"
              markerEnd="url(#arrowhead-ro)"
            />
          );
        }
        if (ann.type === 'text') {
          return (
            <text
              key={i}
              x={ann.x}
              y={ann.y}
              fill={ann.color}
              fontSize="3"
              fontWeight="bold"
              style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: '0.3px' }}
            >
              {ann.label}
            </text>
          );
        }
        return null;
      })}
    </svg>
  );
}
