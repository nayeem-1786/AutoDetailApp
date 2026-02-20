'use client';

import { useState, createElement } from 'react';
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

  return (
    <div className="relative">
      <button
        type="button"
        title="Insert Icon"
        onClick={() => setOpen(!open)}
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
          onInsert={(svg) => {
            onInsert(svg);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IconPickerDropdown — the dropdown panel with search, size, color, grid
// ---------------------------------------------------------------------------

function IconPickerDropdown({
  onInsert,
  onClose,
}: {
  onInsert: (svg: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedSize, setSelectedSize] = useState<number>(20);
  const [selectedColor, setSelectedColor] = useState('var(--site-icon-accent)');

  const filtered = search
    ? ICONS.filter(
        (i) =>
          i.name.toLowerCase().includes(search.toLowerCase()) ||
          i.category.toLowerCase().includes(search.toLowerCase())
      )
    : ICONS;

  const categories = [...new Set(filtered.map((i) => i.category))];

  const generateSvg = (iconDef: (typeof ICONS)[number]) => {
    // For CSS variable colors, render with currentColor and set color via style
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

  return (
    <div className="absolute z-20 top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg">
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Insert Icon</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons..."
          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          autoFocus
        />
      </div>

      {/* Size + Color selectors */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Size</span>
          <div className="flex gap-0.5">
            {ICON_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSize(s)}
                className={`px-1.5 py-0.5 text-xs rounded ${
                  selectedSize === s
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Color</span>
          <div className="flex gap-1">
            {ICON_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setSelectedColor(c.value)}
                title={c.label}
                className={`h-5 w-5 rounded-full border-2 ${
                  selectedColor === c.value ? 'border-brand-600' : 'border-gray-300'
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
                      className="flex items-center justify-center h-9 w-9 rounded hover:bg-gray-100 transition-colors"
                    >
                      <IconComp className="h-5 w-5 text-gray-600" />
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
    </div>
  );
}
