'use client';

import { useState, createElement, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  X,
  SmilePlus,
  Phone,
  Mail,
  MapPin,
  Clock,
  Globe,
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  Star,
  Heart,
  Shield,
  Award,
  Zap,
  Calendar,
  CreditCard,
  Truck,
  Wrench,
  MessageCircle,
  ThumbsUp,
  Navigation,
  type LucideIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Icon catalog — curated Lucide icons for HTML editors
// ---------------------------------------------------------------------------

const ICONS: { name: string; icon: LucideIcon; category: string }[] = [
  // Contact
  { name: 'Phone', icon: Phone, category: 'Contact' },
  { name: 'Mail', icon: Mail, category: 'Contact' },
  { name: 'MapPin', icon: MapPin, category: 'Contact' },
  { name: 'Clock', icon: Clock, category: 'Contact' },
  { name: 'Globe', icon: Globe, category: 'Contact' },
  { name: 'MessageCircle', icon: MessageCircle, category: 'Contact' },
  { name: 'Navigation', icon: Navigation, category: 'Contact' },
  // Social
  { name: 'Facebook', icon: Facebook, category: 'Social' },
  { name: 'Instagram', icon: Instagram, category: 'Social' },
  { name: 'Twitter', icon: Twitter, category: 'Social' },
  { name: 'Youtube', icon: Youtube, category: 'Social' },
  // Trust & Badges
  { name: 'Star', icon: Star, category: 'Trust' },
  { name: 'Heart', icon: Heart, category: 'Trust' },
  { name: 'Shield', icon: Shield, category: 'Trust' },
  { name: 'Award', icon: Award, category: 'Trust' },
  { name: 'ThumbsUp', icon: ThumbsUp, category: 'Trust' },
  // Services
  { name: 'Calendar', icon: Calendar, category: 'Services' },
  { name: 'CreditCard', icon: CreditCard, category: 'Services' },
  { name: 'Truck', icon: Truck, category: 'Services' },
  { name: 'Wrench', icon: Wrench, category: 'Services' },
  { name: 'Zap', icon: Zap, category: 'Services' },
];

const ICON_SIZES = [16, 20, 24, 32] as const;
const ICON_COLORS = [
  { label: 'Theme Accent', value: 'var(--site-icon-accent)', preview: '#CCFF00' },
  { label: 'Text Color', value: 'currentColor', preview: '#6b7280' },
  { label: 'White', value: '#ffffff', preview: '#ffffff' },
  { label: 'Muted', value: 'var(--site-text-muted)', preview: '#9CA3AF' },
] as const;

// ---------------------------------------------------------------------------
// IconPickerTrigger — button + dropdown picker
// ---------------------------------------------------------------------------

interface IconPickerProps {
  onInsert: (svgHtml: string) => void;
  triggerClassName?: string;
}

export function IconPicker({ onInsert, triggerClassName }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const handleToggle = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.min(rect.left, window.innerWidth - 330);
      setPosition({ top: rect.bottom + 4, left: Math.max(4, left) });
    }
    setOpen(true);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="Insert Icon"
        onClick={handleToggle}
        className={
          triggerClassName ??
          `flex items-center justify-center h-7 w-7 rounded transition-colors ${
            open
              ? 'bg-brand-100 text-brand-700'
              : 'hover:bg-gray-200 text-gray-600'
          }`
        }
      >
        <SmilePlus className="h-4 w-4" />
      </button>
      {open && (
        <IconPickerDropdown
          position={position}
          onInsert={(svg) => {
            onInsert(svg);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// IconPickerDropdown — the dropdown panel with search, size, color, grid
// ---------------------------------------------------------------------------

function IconPickerDropdown({
  position,
  onInsert,
  onClose,
}: {
  position: { top: number; left: number };
  onInsert: (svg: string) => void;
  onClose: () => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [selectedSize, setSelectedSize] = useState<number>(20);
  const [selectedColor, setSelectedColor] = useState('var(--site-icon-accent)');

  // Click-outside handler
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Defer so the opening click doesn't immediately close
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const filtered = search
    ? ICONS.filter(
        (i) =>
          i.name.toLowerCase().includes(search.toLowerCase()) ||
          i.category.toLowerCase().includes(search.toLowerCase())
      )
    : ICONS;

  const categories = [...new Set(filtered.map((i) => i.category))];

  const generateSvg = (iconDef: (typeof ICONS)[number]) => {
    const isCssVar = selectedColor.startsWith('var(');
    const svgString = renderToStaticMarkup(
      createElement(iconDef.icon, {
        size: selectedSize,
        color: isCssVar ? 'currentColor' : selectedColor,
        strokeWidth: 2,
      })
    );
    const styleAttr = isCssVar
      ? `style="display:inline-block;vertical-align:middle;color:${selectedColor}"`
      : 'style="display:inline-block;vertical-align:middle"';
    return svgString.replace('<svg ', `<svg ${styleAttr} `);
  };

  return createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-50 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      <div className="p-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Insert Icon</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons..."
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          autoFocus
        />
      </div>

      {/* Size + Color selectors */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">Size</span>
          <div className="flex gap-0.5">
            {ICON_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSize(s)}
                className={`px-1.5 py-0.5 text-xs rounded ${
                  selectedSize === s
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">Color</span>
          <div className="flex gap-1">
            {ICON_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setSelectedColor(c.value)}
                title={c.label}
                className={`h-5 w-5 rounded-full border-2 ${
                  selectedColor === c.value ? 'border-brand-600' : 'border-gray-300 dark:border-gray-600'
                }`}
                style={{
                  backgroundColor: c.preview,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Icon grid */}
      <div className="max-h-48 overflow-y-auto p-2">
        {categories.map((cat) => (
          <div key={cat} className="mb-2">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-1 mb-1">
              {cat}
            </p>
            <div className="grid grid-cols-7 gap-0.5">
              {filtered
                .filter((i) => i.category === cat)
                .map((iconDef) => {
                  const IconComp = iconDef.icon;
                  return (
                    <button
                      key={iconDef.name}
                      title={iconDef.name}
                      onClick={() => onInsert(generateSvg(iconDef))}
                      className="flex items-center justify-center h-9 w-9 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <IconComp className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">No icons found</p>
        )}
      </div>
    </div>,
    document.body
  );
}
