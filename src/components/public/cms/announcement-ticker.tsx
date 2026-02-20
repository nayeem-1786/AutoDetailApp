'use client';

import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { AnnouncementTicker } from '@/lib/supabase/types';
import type { TickerPlacementOptions } from '@/lib/data/cms';
import { resolveTickerPosition, type PageType } from '@/lib/utils/ticker-sections';

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
// SingleTickerMarquee — single continuous CSS animation, no phases.
// Uses duplicated content (2 × REPEAT_COUNT) so translateX(0 → -50%)
// creates a seamless loop. Hover pause is handled entirely by CSS:
//   .ticker-track:hover .animate-marquee { animation-play-state: paused }
// ---------------------------------------------------------------------------
function SingleTickerMarquee({ ticker }: { ticker: AnnouncementTicker }) {
  const speedValue = getSpeedValue(ticker);
  const ref = useRef<HTMLSpanElement>(null);
  const [duration, setDuration] = useState(20);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pxPerSec = speedToPxPerSec(speedValue);
    const halfWidth = el.scrollWidth / 2;
    setDuration(Math.max(3, halfWidth / pxPerSec));
  }, [speedValue]);

  useEffect(() => {
    requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const fontSize = FONT_SIZE_CLASS[ticker.font_size] || FONT_SIZE_CLASS.sm;

  return (
    <div className={`whitespace-nowrap font-medium tracking-wide uppercase ${fontSize}`}>
      <span
        ref={ref}
        className="inline-block animate-marquee"
        style={{ animationDuration: `${duration.toFixed(1)}s`, willChange: 'transform' }}
      >
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
// JS timer paused on hover via React state; marquee visual freeze is CSS.
// ---------------------------------------------------------------------------
function MultiTickerRotation({
  tickers,
  options,
  paused,
}: {
  tickers: AnnouncementTicker[];
  options: TickerPlacementOptions;
  paused?: boolean;
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
    // Don't advance timers while paused
    if (paused) return;

    // Phase machine: bg in -> show content -> hold -> hide content -> bg out -> next
    let timer: ReturnType<typeof setTimeout>;

    if (bgPhase === 'in') {
      const bgDuration = bgTransition === 'none' ? 50 : 400;
      timer = setTimeout(() => {
        setShowContent(true);
        setBgPhase('visible');
      }, bgDuration);
    } else if (bgPhase === 'visible') {
      timer = setTimeout(() => {
        setShowContent(false);
        setBgPhase('out');
      }, holdDuration);
    } else if (bgPhase === 'out') {
      const bgDuration = bgTransition === 'none' ? 50 : 400;
      timer = setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % tickers.length);
        setBgPhase('in');
      }, bgDuration);
    }

    return () => clearTimeout(timer);
  }, [bgPhase, holdDuration, bgTransition, tickers.length, paused]);

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
// Hover-to-pause hook — only used for multi-ticker JS rotation timer.
// Visual marquee freeze is pure CSS (.ticker-track:hover .animate-marquee).
// ---------------------------------------------------------------------------
function useHoverPause() {
  const [paused, setPaused] = useState(false);
  const handlers = {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
  };
  return { paused, handlers };
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
  const { paused, handlers } = useHoverPause();

  if (tickers.length === 0) return null;

  // Single ticker — continuous marquee, hover pause is pure CSS
  if (tickers.length === 1) {
    const ticker = tickers[0];
    return (
      <div
        className="ticker-track relative overflow-hidden py-2.5"
        style={{
          backgroundColor: ticker.bg_color || '#CCFF00',
          color: ticker.text_color || '#000000',
        }}
      >
        <SingleTickerMarquee ticker={ticker} />
      </div>
    );
  }

  // Multiple tickers — CSS pauses marquee, React state pauses JS rotation timer
  return (
    <div {...handlers} className="ticker-track">
      <MultiTickerRotation tickers={tickers} options={options ?? DEFAULT_OPTIONS} paused={paused} />
    </div>
  );
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
  const { paused, handlers } = useHoverPause();

  if (tickers.length === 0) return null;

  // Single ticker — continuous marquee, hover pause is pure CSS
  if (tickers.length === 1) {
    const ticker = tickers[0];
    return (
      <div
        className="ticker-track overflow-hidden py-2.5"
        style={{
          backgroundColor: ticker.bg_color || '#CCFF00',
          color: ticker.text_color || '#000000',
        }}
      >
        <SingleTickerMarquee ticker={ticker} />
      </div>
    );
  }

  return (
    <div {...handlers} className="ticker-track">
      <MultiTickerRotation tickers={tickers} options={options ?? DEFAULT_OPTIONS} paused={paused} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page type detection for ticker filtering
// ---------------------------------------------------------------------------

function getPageType(pathname: string): PageType {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/p/')) return 'cms_pages';
  if (pathname.startsWith('/products')) return 'products';
  if (pathname.startsWith('/services')) return 'services';
  if (pathname.startsWith('/areas')) return 'areas';
  if (pathname === '/gallery') return 'gallery';
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
// LayoutSectionTickers — renders section tickers at the before_footer
// position on ALL pages. Position-specific slots (after_hero, after_services,
// etc.) are handled by SectionTickerSlot in each page component.
// ---------------------------------------------------------------------------

export function LayoutSectionTickers({
  tickers,
  options,
}: {
  tickers: AnnouncementTicker[];
  options?: TickerPlacementOptions;
}) {
  const pathname = usePathname();
  const pageType = getPageType(pathname);

  // Only render tickers whose resolved position is before_footer
  const filtered = tickers.filter((t) => {
    if (!tickerMatchesPage(t, pathname)) return false;
    return resolveTickerPosition(t.section_position, pageType) === 'before_footer';
  });

  if (filtered.length === 0) return null;

  return <SectionTicker tickers={filtered} options={options} />;
}
