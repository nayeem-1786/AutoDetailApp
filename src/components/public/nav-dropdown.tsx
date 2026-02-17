'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import type { WebsiteNavItem } from '@/lib/supabase/types';

interface NavDropdownProps {
  item: WebsiteNavItem;
}

export function NavDropdown({ item }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex items-center gap-1 px-4 py-2 text-sm font-medium text-site-text-muted hover:text-site-text transition-colors group"
      >
        {item.label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
        <span className="absolute inset-x-4 -bottom-px h-0.5 bg-lime scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
      </button>

      {open && item.children && item.children.length > 0 && (
        <div className="absolute left-0 top-full mt-1 w-48 rounded-lg bg-brand-surface shadow-lg ring-1 ring-site-border py-1 z-50">
          {item.children.map((child) => (
            <Link
              key={child.id}
              href={child.url}
              target={child.target}
              className="block px-4 py-2 text-sm text-site-text-secondary hover:bg-site-border-light hover:text-site-text transition-colors"
              onClick={() => setOpen(false)}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
