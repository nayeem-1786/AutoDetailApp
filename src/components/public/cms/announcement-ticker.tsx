'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, X } from 'lucide-react';
import type { AnnouncementTicker } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// TopBarTicker — renders above the site header with animated rotation
// ---------------------------------------------------------------------------
export function TopBarTicker({ tickers }: { tickers: AnnouncementTicker[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Persist dismissal per session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (sessionStorage.getItem('ticker_dismissed') === '1') {
        setDismissed(true);
      }
    }
  }, []);

  // Auto-rotate through tickers
  useEffect(() => {
    if (tickers.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % tickers.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [tickers.length]);

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('ticker_dismissed', '1');
    }
  };

  if (dismissed || tickers.length === 0) return null;

  const current = tickers[currentIndex];

  return (
    <div
      className="relative overflow-hidden py-2.5 px-4"
      style={{
        backgroundColor: current.bg_color || '#CCFF00',
        color: current.text_color || '#000000',
      }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center gap-2 text-sm font-medium tracking-wide uppercase"
          >
            {current.link_url ? (
              <a
                href={current.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <span>{current.message}</span>
                {current.link_text && (
                  <span className="underline">{current.link_text}</span>
                )}
                <ChevronRight className="w-4 h-4 opacity-70" />
              </a>
            ) : (
              <span>{current.message}</span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-black/10 transition-colors"
        aria-label="Dismiss announcements"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {tickers.length > 1 && (
        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-1">
          {tickers.map((_, i) => (
            <div
              key={i}
              className={`w-1 h-1 rounded-full transition-all duration-300 ${
                i === currentIndex ? 'bg-black w-3' : 'bg-black/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionTicker — renders inline between page sections
// ---------------------------------------------------------------------------
export function SectionTicker({ tickers }: { tickers: AnnouncementTicker[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (tickers.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % tickers.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [tickers.length]);

  if (tickers.length === 0) return null;

  const current = tickers[currentIndex];

  return (
    <div
      className="overflow-hidden py-2.5 px-4"
      style={{
        backgroundColor: current.bg_color || '#CCFF00',
        color: current.text_color || '#000000',
      }}
    >
      <div className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center gap-2 text-sm font-medium tracking-wide uppercase"
          >
            <span>{current.message}</span>
            {current.link_url && current.link_text && (
              <a
                href={current.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline ml-1"
              >
                {current.link_text}
              </a>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
