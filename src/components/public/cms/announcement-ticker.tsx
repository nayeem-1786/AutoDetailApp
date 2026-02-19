'use client';

import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AnnouncementTicker } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Speed → CSS animation-duration mapping
// ---------------------------------------------------------------------------
const SPEED_DURATION: Record<string, string> = {
  slow: '35s',
  normal: '20s',
  fast: '10s',
};

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
  const speed = SPEED_DURATION[current.scroll_speed] || SPEED_DURATION.normal;
  const fontSize = FONT_SIZE_CLASS[current.font_size] || FONT_SIZE_CLASS.sm;

  const tickerContent = (
    <>
      <span>{current.message}</span>
      {current.link_url ? (
        <a
          href={current.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity ml-2"
        >
          {current.link_text && (
            <span className="underline">{current.link_text}</span>
          )}
          <ChevronRight className="w-3.5 h-3.5 opacity-70 inline-block" />
        </a>
      ) : current.link_text ? (
        <span className="ml-2 underline">{current.link_text}</span>
      ) : null}
    </>
  );

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
        style={{ animationDuration: speed }}
      >
        {/*
          Marquee trick: duplicate the content so the first copy scrolls off-screen
          while the second copy seamlessly takes over. The animation moves translateX
          from 0 to -50% (the first copy's width).
        */}
        <span
          className="inline-block animate-marquee"
          style={{ animationDuration: speed }}
        >
          <span className="inline-flex items-center gap-8 px-4">
            {tickerContent}
            <span className="inline-block w-16" aria-hidden="true" />
            {tickerContent}
            <span className="inline-block w-16" aria-hidden="true" />
            {tickerContent}
            <span className="inline-block w-16" aria-hidden="true" />
            {tickerContent}
            <span className="inline-block w-16" aria-hidden="true" />
          </span>
          <span className="inline-flex items-center gap-8 px-4" aria-hidden="true">
            {tickerContent}
            <span className="inline-block w-16" />
            {tickerContent}
            <span className="inline-block w-16" />
            {tickerContent}
            <span className="inline-block w-16" />
            {tickerContent}
            <span className="inline-block w-16" />
          </span>
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
  const speed = SPEED_DURATION[current.scroll_speed] || SPEED_DURATION.normal;
  const fontSize = FONT_SIZE_CLASS[current.font_size] || FONT_SIZE_CLASS.sm;

  const tickerContent = (
    <>
      <span>{current.message}</span>
      {current.link_url && current.link_text && (
        <a
          href={current.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline ml-2"
        >
          {current.link_text}
        </a>
      )}
    </>
  );

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
          style={{ animationDuration: speed }}
        >
          <span className="inline-flex items-center gap-8 px-4">
            {tickerContent}
            <span className="inline-block w-16" aria-hidden="true" />
            {tickerContent}
            <span className="inline-block w-16" aria-hidden="true" />
            {tickerContent}
            <span className="inline-block w-16" aria-hidden="true" />
            {tickerContent}
            <span className="inline-block w-16" aria-hidden="true" />
          </span>
          <span className="inline-flex items-center gap-8 px-4" aria-hidden="true">
            {tickerContent}
            <span className="inline-block w-16" />
            {tickerContent}
            <span className="inline-block w-16" />
            {tickerContent}
            <span className="inline-block w-16" />
            {tickerContent}
            <span className="inline-block w-16" />
          </span>
        </span>
      </div>
    </div>
  );
}
