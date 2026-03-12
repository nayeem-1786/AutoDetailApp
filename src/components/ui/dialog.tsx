'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /** When true, backdrop click does not close the dialog (Escape key still works) */
  modal?: boolean;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Dialog({ open, onOpenChange, children, modal }: DialogProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open) {
      // Store the currently focused element to restore later
      previousFocusRef.current = document.activeElement as HTMLElement | null;

      // Auto-focus the first focusable element inside the dialog
      const timer = setTimeout(() => {
        if (dialogRef.current) {
          const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
          if (focusable.length > 0) {
            focusable[0].focus();
          }
        }
      }, 0);

      return () => clearTimeout(timer);
    } else {
      // Restore focus to the element that was focused before the dialog opened
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onOpenChange(false);
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: if on first element, wrap to last
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab: if on last element, wrap to first
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop (visual only — pointer-events-none ensures touch events pass through to clickable layer) */}
      <div className="fixed inset-0 bg-black/50 pointer-events-none" />
      <div
        className="fixed inset-0 flex items-center justify-center p-4 cursor-pointer"
        onClick={modal ? undefined : () => onOpenChange(false)}
        onTouchEnd={modal ? undefined : (e) => { e.preventDefault(); onOpenChange(false); }}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <div
          ref={dialogRef}
          className="relative z-50 w-full max-w-lg rounded-lg bg-ui-bg shadow-ui-lg cursor-auto"
          onClick={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 p-6 pb-0', className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold text-ui-text', className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-ui-text-muted', className)} {...props} />;
}

function DialogContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex justify-end gap-3 p-6 pt-0', className)} {...props} />;
}

function DialogClose({ onClose, className }: { onClose: () => void; className?: string }) {
  return (
    <button
      onClick={onClose}
      className={cn(
        'absolute right-4 top-4 rounded-sm opacity-70 ring-offset-ui-bg transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ui-ring focus:ring-offset-2',
        className
      )}
    >
      <X className="h-4 w-4" />
      <span className="sr-only">Close</span>
    </button>
  );
}

export { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter, DialogClose };
