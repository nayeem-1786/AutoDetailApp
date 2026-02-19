'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AnnouncementTicker } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Speed → consistent px/s rate (content-width-aware)
// ---------------------------------------------------------------------------

/** Map slider value (1-100) to pixels-per-second scroll rate */
function speedToPxPerSec(speed: number): number {
  // speed 1 → 30 px/s (very slow), speed 100 → 300 px/s (very fast)
  return 30 + (speed / 100) * 270;
}

/** Fallback: enum → slider value (for tickers without scroll_speed_value) */
const ENUM_TO_VALUE: Record<string, number> = {
  slow: 25,
  normal: 50,
  fast: 75,
};

function getSpeedValue(ticker: AnnouncementTicker): number {
  return ticker.scroll_speed_value ?? ENUM_TO_VALUE[ticker.scroll_speed] ?? 50;
}

// ---------------------------------------------------------------------------
// Spacing constant — gap between each message repetition (in rem).
// Every message is followed by the same spacer so the loop is seamless.
// ---------------------------------------------------------------------------
const SPACER_REM = 5; // 5rem = 80px

// ---------------------------------------------------------------------------
// Custom hook: measure content width and compute duration for constant px/s
// ---------------------------------------------------------------------------
function useMarqueeDuration(speedValue: number) {
  const ref = useRef<HTMLSpanElement>(null);
  const [duration, setDuration] = useState<number | null>(null); // null = not yet measured
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const totalWidth = el.scrollWidth;
    const halfWidth = totalWidth / 2; // animation moves -50%
    const pxPerSec = speedToPxPerSec(speedValue);
    const dur = Math.max(3, halfWidth / pxPerSec);
    setDuration(dur);
    setReady(true);
  }, [speedValue]);

  useEffect(() => {
    // Measure after first paint so content is laid out
    requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return { ref, duration: duration ?? 20, ready };
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
// Single message unit — message + optional link + fixed-width spacer
// Every unit is structurally identical so spacing is perfectly even.
// ---------------------------------------------------------------------------
function MessageUnit({ ticker }: { ticker: AnnouncementTicker }) {
  return (
    <span className="inline-flex items-center">
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
      {/* Fixed spacer after EVERY message — ensures even distribution */}
      <span className="inline-block" style={{ width: `${SPACER_REM}rem` }} />
    </span>
  );
}

// How many copies per half — enough to fill wide screens for short messages
const REPEAT_COUNT = 6;

// ---------------------------------------------------------------------------
// TopBarTicker — renders above the site header with horizontal marquee scroll
// Supports inline HTML in messages (e.g., <span style="color:red;">TEXT</span>)
// ---------------------------------------------------------------------------
export function TopBarTicker({ tickers }: { tickers: AnnouncementTicker[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const current = tickers[currentIndex];
  const speedValue = current ? getSpeedValue(current) : 50;
  const { ref, duration, ready } = useMarqueeDuration(speedValue);

  // Auto-rotate through tickers (when multiple)
  useEffect(() => {
    if (tickers.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % tickers.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [tickers.length]);

  if (tickers.length === 0) return null;

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
          Marquee: two identical halves. The animation scrolls translateX from
          0 to -50%. When it resets, the second half is in the exact position
          the first half started — seamless loop. Every message unit has the
          same trailing spacer, so there are no gaps at the seam.

          The span is invisible until measurement is done to prevent a flash
          of incorrect speed on first render.
        */}
        <span
          ref={ref}
          className={`inline-block ${ready ? 'animate-marquee' : ''}`}
          style={{
            animationDuration: `${duration.toFixed(1)}s`,
            opacity: ready ? 1 : 0,
          }}
        >
          {/* First half */}
          {Array.from({ length: REPEAT_COUNT }, (_, i) => (
            <MessageUnit key={`a-${i}`} ticker={current} />
          ))}
          {/* Second half — identical duplicate for seamless loop */}
          {Array.from({ length: REPEAT_COUNT }, (_, i) => (
            <MessageUnit key={`b-${i}`} ticker={current} />
          ))}
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
  const current = tickers[currentIndex];
  const speedValue = current ? getSpeedValue(current) : 50;
  const { ref, duration, ready } = useMarqueeDuration(speedValue);

  useEffect(() => {
    if (tickers.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % tickers.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [tickers.length]);

  if (tickers.length === 0) return null;

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
          ref={ref}
          className={`inline-block ${ready ? 'animate-marquee' : ''}`}
          style={{
            animationDuration: `${duration.toFixed(1)}s`,
            opacity: ready ? 1 : 0,
          }}
        >
          {/* First half */}
          {Array.from({ length: REPEAT_COUNT }, (_, i) => (
            <MessageUnit key={`a-${i}`} ticker={current} />
          ))}
          {/* Second half — identical duplicate for seamless loop */}
          {Array.from({ length: REPEAT_COUNT }, (_, i) => (
            <MessageUnit key={`b-${i}`} ticker={current} />
          ))}
        </span>
      </div>
    </div>
  );
}
