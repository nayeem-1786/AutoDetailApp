'use client';

import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AnnouncementTicker } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Speed → CSS animation-duration mapping
// ---------------------------------------------------------------------------

/** Convert slider value (1-100) to animation duration in seconds */
function speedToDuration(speed: number): number {
  return Math.max(5, Math.round(60 - (speed / 100) * 55));
}

/** Fallback: enum → slider value (for tickers without scroll_speed_value) */
const ENUM_TO_VALUE: Record<string, number> = {
  slow: 25,
  normal: 50,
  fast: 75,
};

function getDuration(ticker: AnnouncementTicker): string {
  const value = ticker.scroll_speed_value ?? ENUM_TO_VALUE[ticker.scroll_speed] ?? 50;
  return `${speedToDuration(value)}s`;
}

// ---------------------------------------------------------------------------
// Font size → Tailwind class mapping
// ---------------------------------------------------------------------------
const FONT_SIZE_CLASS: Record<string, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
};

// ---------------------------------------------------------------------------
// TopBarTicker — renders above the site header with horizontal marquee scroll
// Supports inline HTML in messages (e.g., <span style="color:red;">TEXT</span>)
// ---------------------------------------------------------------------------
export function TopBarTicker({ tickers }: { tickers: AnnouncementTicker[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto-rotate through tickers (when multiple)
  useEffect(() => {
    if (tickers.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % tickers.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [tickers.length]);

  if (tickers.length === 0) return null;

  const current = tickers[currentIndex];
  const duration = getDuration(current);
  const fontSize = FONT_SIZE_CLASS[current.font_size] || FONT_SIZE_CLASS.sm;

  return (
    <div
      key={currentIndex}
      className="relative overflow-hidden py-2.5"
      style={{
        backgroundColor: current.bg_color || '#CCFF00',
        color: current.text_color || '#000000',
      }}
    >
      <div
        className={`whitespace-nowrap font-medium tracking-wide uppercase ${fontSize}`}
      >
        {/*
          Marquee trick: duplicate the content so the first copy scrolls off-screen
          while the second copy seamlessly takes over. The animation moves translateX
          from 0 to -50% (the first copy's width).
        */}
        <span
          className="inline-block animate-marquee"
          style={{ animationDuration: duration }}
        >
          <TickerContent ticker={current} count={4} />
          <TickerContent ticker={current} count={4} aria-hidden />
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionTicker — renders inline between page sections with marquee scroll
// ---------------------------------------------------------------------------
export function SectionTicker({ tickers }: { tickers: AnnouncementTicker[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (tickers.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % tickers.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [tickers.length]);

  if (tickers.length === 0) return null;

  const current = tickers[currentIndex];
  const duration = getDuration(current);
  const fontSize = FONT_SIZE_CLASS[current.font_size] || FONT_SIZE_CLASS.sm;

  return (
    <div
      key={currentIndex}
      className="overflow-hidden py-2.5"
      style={{
        backgroundColor: current.bg_color || '#CCFF00',
        color: current.text_color || '#000000',
      }}
    >
      <div className={`whitespace-nowrap font-medium tracking-wide uppercase ${fontSize}`}>
        <span
          className="inline-block animate-marquee"
          style={{ animationDuration: duration }}
        >
          <SectionTickerContent ticker={current} count={4} />
          <SectionTickerContent ticker={current} count={4} aria-hidden />
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared content helpers — renders repeated ticker message with HTML support
// ---------------------------------------------------------------------------

function TickerContent({ ticker, count, 'aria-hidden': ariaHidden }: {
  ticker: AnnouncementTicker;
  count: number;
  'aria-hidden'?: boolean;
}) {
  const items = Array.from({ length: count });
  return (
    <span className="inline-flex items-center gap-8 px-4" aria-hidden={ariaHidden || undefined}>
      {items.map((_, i) => (
        <span key={i} className="inline-flex items-center">
          <span dangerouslySetInnerHTML={{ __html: ticker.message }} />
          {ticker.link_url ? (
            <a
              href={ticker.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity ml-2"
            >
              {ticker.link_text && (
                <span className="underline">{ticker.link_text}</span>
              )}
              <ChevronRight className="w-3.5 h-3.5 opacity-70 inline-block" />
            </a>
          ) : ticker.link_text ? (
            <span className="ml-2 underline">{ticker.link_text}</span>
          ) : null}
          {i < count - 1 && <span className="inline-block w-16" />}
        </span>
      ))}
    </span>
  );
}

function SectionTickerContent({ ticker, count, 'aria-hidden': ariaHidden }: {
  ticker: AnnouncementTicker;
  count: number;
  'aria-hidden'?: boolean;
}) {
  const items = Array.from({ length: count });
  return (
    <span className="inline-flex items-center gap-8 px-4" aria-hidden={ariaHidden || undefined}>
      {items.map((_, i) => (
        <span key={i} className="inline-flex items-center">
          <span dangerouslySetInnerHTML={{ __html: ticker.message }} />
          {ticker.link_url && ticker.link_text && (
            <a
              href={ticker.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline ml-2"
            >
              {ticker.link_text}
            </a>
          )}
          {i < count - 1 && <span className="inline-block w-16" />}
        </span>
      ))}
    </span>
  );
}
