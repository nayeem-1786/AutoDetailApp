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
// Custom hook: 3-phase marquee — hidden → entering (scroll-in) → looping
//
// Phase 1 (hidden):   Content is invisible while we measure its width.
// Phase 2 (entering): Content scrolls in from the right edge of the viewport
//                     at the configured speed. One-time animation.
// Phase 3 (looping):  Seamless infinite marquee loop at the configured speed.
// ---------------------------------------------------------------------------
type MarqueePhase = 'hidden' | 'entering' | 'looping';

function useMarquee(speedValue: number) {
  const ref = useRef<HTMLSpanElement>(null);
  const [loopDuration, setLoopDuration] = useState(20);
  const [enterDuration, setEnterDuration] = useState(3);
  const [phase, setPhase] = useState<MarqueePhase>('hidden');

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const pxPerSec = speedToPxPerSec(speedValue);

    // Loop duration: half content width / px-per-sec
    const totalWidth = el.scrollWidth;
    const halfWidth = totalWidth / 2;
    setLoopDuration(Math.max(3, halfWidth / pxPerSec));

    // Enter duration: viewport width / px-per-sec (distance from right edge)
    const vw = window.innerWidth;
    setEnterDuration(Math.max(1, vw / pxPerSec));

    // Kick off enter phase once measured
    setPhase((prev) => (prev === 'hidden' ? 'entering' : prev));
  }, [speedValue]);

  useEffect(() => {
    requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Timer-based transition from entering → looping.
  // onAnimationEnd is unreliable on mobile Safari, so use a timer instead.
  useEffect(() => {
    if (phase !== 'entering') return;
    const timer = setTimeout(() => {
      setPhase((prev) => (prev === 'entering' ? 'looping' : prev));
    }, enterDuration * 1000 + 50); // +50ms buffer
    return () => clearTimeout(timer);
  }, [phase, enterDuration]);

  return { ref, loopDuration, enterDuration, phase };
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
// Helper: build className and style for the marquee span based on phase
// ---------------------------------------------------------------------------
function marqueeProps(
  phase: MarqueePhase,
  enterDuration: number,
  loopDuration: number,
) {
  const className =
    phase === 'entering'
      ? 'inline-block animate-marquee-enter'
      : phase === 'looping'
        ? 'inline-block animate-marquee'
        : 'inline-block';

  const style: React.CSSProperties = {
    animationDuration:
      phase === 'entering'
        ? `${enterDuration.toFixed(1)}s`
        : `${loopDuration.toFixed(1)}s`,
    opacity: phase === 'hidden' ? 0 : 1,
    willChange: 'transform',
    WebkitAnimation: phase === 'entering'
      ? `marquee-enter ${enterDuration.toFixed(1)}s linear forwards`
      : phase === 'looping'
        ? `marquee ${loopDuration.toFixed(1)}s linear infinite`
        : 'none',
  };

  return { className, style };
}

// ---------------------------------------------------------------------------
// TopBarTicker — renders above the site header with horizontal marquee scroll
// Supports inline HTML in messages (e.g., <span style="color:red;">TEXT</span>)
// ---------------------------------------------------------------------------
export function TopBarTicker({ tickers }: { tickers: AnnouncementTicker[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const current = tickers[currentIndex];
  const speedValue = current ? getSpeedValue(current) : 50;
  const { ref, loopDuration, enterDuration, phase } =
    useMarquee(speedValue);

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
  const mp = marqueeProps(phase, enterDuration, loopDuration);

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
        <span
          ref={ref}
          className={mp.className}
          style={mp.style}
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
  const { ref, loopDuration, enterDuration, phase } =
    useMarquee(speedValue);

  useEffect(() => {
    if (tickers.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % tickers.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [tickers.length]);

  if (tickers.length === 0) return null;

  const fontSize = FONT_SIZE_CLASS[current.font_size] || FONT_SIZE_CLASS.sm;
  const mp = marqueeProps(phase, enterDuration, loopDuration);

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
          className={mp.className}
          style={mp.style}
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
