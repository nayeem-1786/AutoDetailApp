'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AnnouncementTicker } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Speed map: scroll_speed → CSS animation duration for a full cycle
// ---------------------------------------------------------------------------
const SPEED_MAP: Record<string, number> = {
  slow: 30,
  normal: 20,
  fast: 12,
};

// ---------------------------------------------------------------------------
// Font-size map
// ---------------------------------------------------------------------------
const FONT_MAP: Record<string, string> = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
};

// ---------------------------------------------------------------------------
// TopBarTicker — renders above the site header
// ---------------------------------------------------------------------------
export function TopBarTicker({ tickers }: { tickers: AnnouncementTicker[] }) {
  const [dismissed, setDismissed] = useState(false);

  // Persist dismissal per session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const key = 'ticker_dismissed';
      if (sessionStorage.getItem(key) === '1') {
        setDismissed(true);
      }
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('ticker_dismissed', '1');
    }
  };

  if (dismissed || tickers.length === 0) return null;

  return (
    <div className="relative">
      {tickers.map((ticker) => (
        <TickerStrip key={ticker.id} ticker={ticker} />
      ))}
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 opacity-50 hover:opacity-100 transition-opacity"
        style={{ color: tickers[0]?.text_color ?? '#fff' }}
        aria-label="Dismiss announcements"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionTicker — renders inline between page sections
// ---------------------------------------------------------------------------
export function SectionTicker({ tickers }: { tickers: AnnouncementTicker[] }) {
  if (tickers.length === 0) return null;

  return (
    <div>
      {tickers.map((ticker) => (
        <TickerStrip key={ticker.id} ticker={ticker} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TickerStrip — individual scrolling marquee
// ---------------------------------------------------------------------------
function TickerStrip({ ticker }: { ticker: AnnouncementTicker }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [needsScroll, setNeedsScroll] = useState(true);
  const duration = SPEED_MAP[ticker.scroll_speed] ?? 20;
  const fontSize = FONT_MAP[ticker.font_size] ?? '0.875rem';

  // Check if text overflows container — if not, center it instead of scrolling
  useEffect(() => {
    const check = () => {
      if (containerRef.current && textRef.current) {
        setNeedsScroll(textRef.current.scrollWidth > containerRef.current.clientWidth);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [ticker.message, ticker.link_text]);

  const content = (
    <>
      {ticker.message}
      {ticker.link_url && ticker.link_text && (
        <a
          href={ticker.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 underline hover:no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          {ticker.link_text}
        </a>
      )}
    </>
  );

  return (
    <div
      ref={containerRef}
      className="overflow-hidden whitespace-nowrap py-1.5 px-10"
      style={{
        backgroundColor: ticker.bg_color,
        color: ticker.text_color,
        fontSize,
      }}
    >
      {needsScroll ? (
        <span
          ref={textRef}
          className="inline-block animate-marquee"
          style={{
            animationDuration: `${duration}s`,
          }}
        >
          {content}
          {/* Duplicate for seamless loop */}
          <span className="mx-16" aria-hidden="true">
            {content}
          </span>
        </span>
      ) : (
        <span ref={textRef} className="block text-center">
          {content}
        </span>
      )}
    </div>
  );
}
