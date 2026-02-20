'use client';

import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { AnnouncementTicker } from '@/lib/supabase/types';
import type { TickerPlacementOptions } from '@/lib/data/cms';

// ---------------------------------------------------------------------------
// Speed -> consistent px/s rate
// ---------------------------------------------------------------------------

function speedToPxPerSec(speed: number): number {
  return 30 + (speed / 100) * 270;
}

const ENUM_TO_VALUE: Record<string, number> = {
  slow: 25,
  normal: 50,
  fast: 75,
};

function getSpeedValue(ticker: AnnouncementTicker): number {
  return ticker.scroll_speed_value ?? ENUM_TO_VALUE[ticker.scroll_speed] ?? 50;
}

// ---------------------------------------------------------------------------
// Font size -> Tailwind class mapping
// ---------------------------------------------------------------------------
const FONT_SIZE_CLASS: Record<string, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
};

// ---------------------------------------------------------------------------
// Spacing constant
// ---------------------------------------------------------------------------
const SPACER_REM = 5;

// ---------------------------------------------------------------------------
// 4-phase marquee hook (unchanged — used for single-ticker and "scroll" mode)
// ---------------------------------------------------------------------------
type MarqueePhase = 'hidden' | 'ready' | 'entering' | 'looping';

function useMarquee(speedValue: number) {
  const ref = useRef<HTMLSpanElement>(null);
  const [loopDuration, setLoopDuration] = useState(20);
  const [enterDuration, setEnterDuration] = useState(3);
  const [enterOffset, setEnterOffset] = useState(0);
  const [phase, setPhase] = useState<MarqueePhase>('hidden');

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pxPerSec = speedToPxPerSec(speedValue);
    const totalWidth = el.scrollWidth;
    const halfWidth = totalWidth / 2;
    setLoopDuration(Math.max(3, halfWidth / pxPerSec));
    const vw = window.innerWidth;
    setEnterDuration(Math.max(1, vw / pxPerSec));
    setEnterOffset(vw);
    setPhase((prev) => (prev === 'hidden' ? 'ready' : prev));
  }, [speedValue]);

  useEffect(() => {
    requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  useEffect(() => {
    if (phase !== 'ready') return;
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setPhase('entering');
      });
    });
    return () => { cancelled = true; };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'entering') return;
    const timer = setTimeout(() => {
      setPhase((prev) => (prev === 'entering' ? 'looping' : prev));
    }, enterDuration * 1000 + 100);
    return () => clearTimeout(timer);
  }, [phase, enterDuration]);

  return { ref, loopDuration, enterDuration, enterOffset, phase };
}

function marqueeProps(
  phase: MarqueePhase,
  enterDuration: number,
  loopDuration: number,
  enterOffset: number,
): { className: string; style: React.CSSProperties } {
  switch (phase) {
    case 'hidden':
      return { className: 'inline-block', style: { opacity: 0 } };
    case 'ready':
      return {
        className: 'inline-block',
        style: { transform: `translateX(${enterOffset}px)`, willChange: 'transform' },
      };
    case 'entering':
      return {
        className: 'inline-block',
        style: {
          transform: 'translateX(0)',
          transition: `transform ${enterDuration.toFixed(1)}s linear`,
          willChange: 'transform',
        },
      };
    case 'looping':
      return {
        className: 'inline-block animate-marquee',
        style: { animationDuration: `${loopDuration.toFixed(1)}s`, willChange: 'transform' },
      };
  }
}

// ---------------------------------------------------------------------------
// MessageUnit — message text + optional link + spacer
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
      <span className="inline-block" style={{ width: `${SPACER_REM}rem` }} />
    </span>
  );
}

const REPEAT_COUNT = 6;

// ---------------------------------------------------------------------------
// SingleTickerMarquee — continuous marquee for a single ticker (or one ticker
// in rotation "scroll" mode). Full bar in that ticker's colors/font.
// ---------------------------------------------------------------------------
function SingleTickerMarquee({ ticker }: { ticker: AnnouncementTicker }) {
  const speedValue = getSpeedValue(ticker);
  const { ref, loopDuration, enterDuration, enterOffset, phase } = useMarquee(speedValue);
  const fontSize = FONT_SIZE_CLASS[ticker.font_size] || FONT_SIZE_CLASS.sm;
  const mp = marqueeProps(phase, enterDuration, loopDuration, enterOffset);

  return (
    <div className={`whitespace-nowrap font-medium tracking-wide uppercase ${fontSize}`}>
      <span ref={ref} className={mp.className} style={mp.style}>
        {Array.from({ length: REPEAT_COUNT }, (_, i) => (
          <MessageUnit key={`a-${i}`} ticker={ticker} />
        ))}
        {Array.from({ length: REPEAT_COUNT }, (_, i) => (
          <MessageUnit key={`b-${i}`} ticker={ticker} />
        ))}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StaticMessage — for non-scroll text entries (ltr, rtl, ttb, btt, fade_in).
// Shows the message centered with its own animation.
// ---------------------------------------------------------------------------
function StaticMessage({
  ticker,
  textEntry,
}: {
  ticker: AnnouncementTicker;
  textEntry: string;
}) {
  const fontSize = FONT_SIZE_CLASS[ticker.font_size] || FONT_SIZE_CLASS.sm;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation on next frame
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const entryStyles = getTextEntryStyles(textEntry, visible);

  return (
    <div
      className={`font-medium tracking-wide uppercase ${fontSize} text-center px-4 overflow-hidden`}
    >
      <span
        className="inline-flex items-center transition-all duration-700 ease-out"
        style={entryStyles}
      >
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
      </span>
    </div>
  );
}

function getTextEntryStyles(
  textEntry: string,
  visible: boolean,
): React.CSSProperties {
  if (visible) {
    return { opacity: 1, transform: 'translate(0, 0)' };
  }
  switch (textEntry) {
    case 'ltr':
      return { opacity: 0, transform: 'translateX(-100%)' };
    case 'rtl':
      return { opacity: 0, transform: 'translateX(100%)' };
    case 'ttb':
      return { opacity: 0, transform: 'translateY(-100%)' };
    case 'btt':
      return { opacity: 0, transform: 'translateY(100%)' };
    case 'fade_in':
      return { opacity: 0, transform: 'translate(0, 0)' };
    default:
      return { opacity: 0, transform: 'translateX(100%)' };
  }
}

// ---------------------------------------------------------------------------
// Default options (matches data layer defaults)
// ---------------------------------------------------------------------------
const DEFAULT_OPTIONS: TickerPlacementOptions = {
  hold_duration: 5,
  bg_transition: 'crossfade',
  text_entry: 'rtl',
};

// ---------------------------------------------------------------------------
// MultiTickerRotation — cycles through tickers one at a time with
// configurable background transition and text entry animation.
// ---------------------------------------------------------------------------
function MultiTickerRotation({
  tickers,
  options,
}: {
  tickers: AnnouncementTicker[];
  options: TickerPlacementOptions;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [bgPhase, setBgPhase] = useState<'in' | 'visible' | 'out'>('in');
  const [showContent, setShowContent] = useState(false);
  const current = tickers[currentIndex];

  const holdDuration = options.hold_duration * 1000;
  const bgTransition = options.bg_transition;
  const textEntry = options.text_entry;
  const isScrollMode = textEntry === 'scroll';

  useEffect(() => {
    // Phase machine: bg in -> show content -> hold -> hide content -> bg out -> next
    let timer: ReturnType<typeof setTimeout>;

    if (bgPhase === 'in') {
      // Background is entering — wait for transition, then show content
      const bgDuration = bgTransition === 'none' ? 50 : 400;
      timer = setTimeout(() => {
        setShowContent(true);
        setBgPhase('visible');
      }, bgDuration);
    } else if (bgPhase === 'visible') {
      // Content visible — hold for duration, then transition to next
      timer = setTimeout(() => {
        setShowContent(false);
        setBgPhase('out');
      }, holdDuration);
    } else if (bgPhase === 'out') {
      // Content hidden — transition bg out, then move to next ticker
      const bgDuration = bgTransition === 'none' ? 50 : 400;
      timer = setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % tickers.length);
        setBgPhase('in');
      }, bgDuration);
    }

    return () => clearTimeout(timer);
  }, [bgPhase, holdDuration, bgTransition, tickers.length]);

  // Reset phases when ticker list changes
  useEffect(() => {
    setCurrentIndex(0);
    setBgPhase('in');
    setShowContent(false);
  }, [tickers.length]);

  const bgStyles = getBgTransitionStyles(bgTransition, bgPhase, current);

  return (
    <div className="relative overflow-hidden">
      <div
        className="py-2.5 transition-all"
        style={{
          ...bgStyles,
          color: current.text_color || '#ffffff',
        }}
      >
        {showContent ? (
          isScrollMode ? (
            <SingleTickerMarquee key={currentIndex} ticker={current} />
          ) : (
            <StaticMessage
              key={currentIndex}
              ticker={current}
              textEntry={textEntry}
            />
          )
        ) : (
          // Invisible placeholder to maintain height based on font_size
          <div
            className={`font-medium tracking-wide uppercase ${
              FONT_SIZE_CLASS[current.font_size] || FONT_SIZE_CLASS.sm
            } text-center invisible`}
          >
            &nbsp;
          </div>
        )}
      </div>
    </div>
  );
}

function getBgTransitionStyles(
  transition: string,
  phase: 'in' | 'visible' | 'out',
  ticker: AnnouncementTicker,
): React.CSSProperties {
  const bg = ticker.bg_color || '#CCFF00';

  switch (transition) {
    case 'slide_down':
      return {
        backgroundColor: bg,
        transitionProperty: 'transform, opacity',
        transitionDuration: '0.4s',
        transitionTimingFunction: 'ease-out',
        transform:
          phase === 'in'
            ? 'translateY(-100%)'
            : phase === 'out'
              ? 'translateY(100%)'
              : 'translateY(0)',
        opacity: phase === 'visible' ? 1 : 0,
      };
    case 'crossfade':
      return {
        backgroundColor: bg,
        transitionProperty: 'opacity',
        transitionDuration: '0.4s',
        transitionTimingFunction: 'ease-in-out',
        opacity: phase === 'visible' ? 1 : phase === 'in' ? 0 : 0,
      };
    case 'none':
    default:
      return { backgroundColor: bg };
  }
}

// ---------------------------------------------------------------------------
// TopBarTicker
// ---------------------------------------------------------------------------
export function TopBarTicker({
  tickers,
  options,
}: {
  tickers: AnnouncementTicker[];
  options?: TickerPlacementOptions;
}) {
  if (tickers.length === 0) return null;

  // Single ticker — always continuous marquee
  if (tickers.length === 1) {
    const ticker = tickers[0];
    return (
      <div
        className="relative overflow-hidden py-2.5"
        style={{
          backgroundColor: ticker.bg_color || '#CCFF00',
          color: ticker.text_color || '#000000',
        }}
      >
        <SingleTickerMarquee ticker={ticker} />
      </div>
    );
  }

  // Multiple tickers — use configurable rotation
  return <MultiTickerRotation tickers={tickers} options={options ?? DEFAULT_OPTIONS} />;
}

// ---------------------------------------------------------------------------
// SectionTicker
// ---------------------------------------------------------------------------
export function SectionTicker({
  tickers,
  options,
}: {
  tickers: AnnouncementTicker[];
  options?: TickerPlacementOptions;
}) {
  if (tickers.length === 0) return null;

  // Single ticker — always continuous marquee
  if (tickers.length === 1) {
    const ticker = tickers[0];
    return (
      <div
        className="overflow-hidden py-2.5"
        style={{
          backgroundColor: ticker.bg_color || '#CCFF00',
          color: ticker.text_color || '#000000',
        }}
      >
        <SingleTickerMarquee ticker={ticker} />
      </div>
    );
  }

  return <MultiTickerRotation tickers={tickers} options={options ?? DEFAULT_OPTIONS} />;
}

// ---------------------------------------------------------------------------
// Page type detection for ticker filtering
// ---------------------------------------------------------------------------

function getPageType(pathname: string): string {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/p/')) return 'cms_pages';
  if (pathname.startsWith('/products')) return 'products';
  if (pathname.startsWith('/services')) return 'services';
  if (pathname === '/cart') return 'cart';
  if (pathname.startsWith('/checkout')) return 'checkout';
  if (pathname.startsWith('/account')) return 'account';
  return 'other';
}

function tickerMatchesPage(ticker: AnnouncementTicker, pathname: string): boolean {
  const pages = ticker.target_pages;
  if (!pages || pages.length === 0 || pages.includes('all')) return true;
  const pageType = getPageType(pathname);
  return pages.includes(pageType);
}

// ---------------------------------------------------------------------------
// Hook to set --ticker-height CSS variable on :root
// ---------------------------------------------------------------------------
function useTickerHeight(ref: RefObject<HTMLDivElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) {
      document.documentElement.style.setProperty('--ticker-height', '0px');
      return;
    }

    const el = ref.current;
    if (!el) return;

    const updateHeight = () => {
      document.documentElement.style.setProperty(
        '--ticker-height',
        `${el.offsetHeight}px`,
      );
    };

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(el);
    updateHeight();

    return () => observer.disconnect();
  }, [ref, active]);
}

// ---------------------------------------------------------------------------
// TopBarTickerFiltered — client wrapper that filters tickers by pathname.
// Renders sticky at top-0 and sets --ticker-height CSS variable so the
// header can stick directly below.
// ---------------------------------------------------------------------------

export function TopBarTickerFiltered({
  tickers,
  options,
}: {
  tickers: AnnouncementTicker[];
  options?: TickerPlacementOptions;
}) {
  const pathname = usePathname();
  const filtered = tickers.filter((t) => tickerMatchesPage(t, pathname));
  const wrapperRef = useRef<HTMLDivElement>(null);

  useTickerHeight(wrapperRef, filtered.length > 0);

  if (filtered.length === 0) return null;

  return (
    <div ref={wrapperRef} className="sticky top-0 z-50">
      <TopBarTicker tickers={filtered} options={options} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionTickerFiltered — client wrapper that filters tickers by pathname
// ---------------------------------------------------------------------------

export function SectionTickerFiltered({
  tickers,
  options,
}: {
  tickers: AnnouncementTicker[];
  options?: TickerPlacementOptions;
}) {
  const pathname = usePathname();
  const filtered = tickers.filter((t) => tickerMatchesPage(t, pathname));
  return <SectionTicker tickers={filtered} options={options} />;
}

// ---------------------------------------------------------------------------
// LayoutSectionTickers — renders section tickers before the footer on all
// non-homepage pages. The homepage handles its own inline section tickers.
// ---------------------------------------------------------------------------

export function LayoutSectionTickers({
  tickers,
  options,
}: {
  tickers: AnnouncementTicker[];
  options?: TickerPlacementOptions;
}) {
  const pathname = usePathname();

  // Homepage renders section tickers inline — skip here to avoid duplicates
  if (pathname === '/') return null;

  const filtered = tickers.filter((t) => tickerMatchesPage(t, pathname));
  if (filtered.length === 0) return null;

  return <SectionTicker tickers={filtered} options={options} />;
}
