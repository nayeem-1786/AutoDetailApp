'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import Link from 'next/link';
import type { HeroSlide, HeroCarouselConfig } from '@/lib/supabase/types';

interface HeroCarouselProps {
  slides: HeroSlide[];
  config: HeroCarouselConfig;
}

/**
 * Splits the title so the LAST word gets a lime gradient highlight.
 * Returns JSX with the last word wrapped in a span.
 */
function renderTitle(title: string) {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return title;
  const lastWord = words.pop()!;
  return (
    <>
      {words.join(' ')}{' '}
      <span className="text-gradient-lime">{lastWord}</span>
    </>
  );
}

export function HeroCarousel({ slides, config }: HeroCarouselProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isCarousel = config.mode === 'carousel' && slides.length > 1;

  const goTo = useCallback(
    (index: number, dir: number) => {
      setDirection(dir);
      setCurrent(index);
    },
    []
  );

  const next = useCallback(() => {
    goTo((current + 1) % slides.length, 1);
  }, [current, slides.length, goTo]);

  const prev = useCallback(() => {
    goTo((current - 1 + slides.length) % slides.length, -1);
  }, [current, slides.length, goTo]);

  // Auto-advance
  useEffect(() => {
    if (!isCarousel || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(next, config.interval_ms);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isCarousel, isPaused, next, config.interval_ms]);

  if (slides.length === 0) return null;

  const slide = slides[current];
  // overlay_opacity is stored as 0-100 in the DB
  const overlayPct = slide.overlay_opacity ?? 50;

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
  };

  return (
    <section
      className="relative overflow-hidden bg-brand-black min-h-[500px] sm:min-h-[600px] lg:min-h-[85vh]"
      onMouseEnter={() => config.pause_on_hover && setIsPaused(true)}
      onMouseLeave={() => config.pause_on_hover && setIsPaused(false)}
    >
      <AnimatePresence custom={direction} mode="wait">
        <motion.div
          key={current}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="absolute inset-0"
        >
          {/* Background media */}
          {slide.content_type === 'video' && slide.video_url ? (
            <>
              {slide.video_thumbnail_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={slide.video_thumbnail_url}
                  alt={slide.title || ''}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <video
                src={slide.video_url}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            </>
          ) : slide.content_type === 'before_after' &&
            slide.before_image_url &&
            slide.after_image_url ? (
            <HeroBeforeAfter
              beforeSrc={slide.before_image_url}
              afterSrc={slide.after_image_url}
              beforeLabel={slide.before_label ?? 'Before'}
              afterLabel={slide.after_label ?? 'After'}
            />
          ) : slide.image_url ? (
            <picture>
              {slide.image_url_mobile && (
                <source media="(max-width: 639px)" srcSet={slide.image_url_mobile} />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.image_url}
                alt={slide.image_alt || slide.title || ''}
                className="absolute inset-0 w-full h-full object-cover"
                loading={current === 0 ? 'eager' : 'lazy'}
              />
            </picture>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-grey to-brand-black" />
          )}

          {/* Slow zoom effect on image slides */}
          {slide.content_type !== 'before_after' && slide.image_url && (
            <motion.div
              className="absolute inset-0"
              initial={{ scale: 1 }}
              animate={{ scale: 1.05 }}
              transition={{ duration: 8, ease: 'linear' }}
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* Overlay gradients */}
          <div
            className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20"
            style={{ opacity: (overlayPct / 100) + 0.3 }}
          />
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: (overlayPct / 100) * 0.5 }}
          />
        </motion.div>
      </AnimatePresence>

      {/* Content overlay */}
      <div className="relative z-10 h-full min-h-[500px] sm:min-h-[600px] lg:min-h-[85vh] flex items-end pb-16 sm:pb-24 lg:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="max-w-2xl"
            >
              {slide.title && (
                current === 0 ? (
                  <h1 className="text-4xl sm:text-5xl lg:text-7xl xl:text-8xl font-black text-site-text leading-[0.9] tracking-tight uppercase">
                    {renderTitle(slide.title)}
                  </h1>
                ) : (
                  <p className="text-4xl sm:text-5xl lg:text-7xl xl:text-8xl font-black text-site-text leading-[0.9] tracking-tight uppercase">
                    {renderTitle(slide.title)}
                  </p>
                )
              )}
              {slide.subtitle && (
                <motion.p
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.35 }}
                  className="mt-4 sm:mt-6 text-base sm:text-lg lg:text-xl text-site-text-secondary max-w-lg leading-relaxed"
                >
                  {slide.subtitle}
                </motion.p>
              )}
              {slide.cta_text && slide.cta_url && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                >
                  <Link
                    href={slide.cta_url}
                    className="inline-flex items-center gap-2 mt-6 sm:mt-8 px-8 py-4 site-btn-cta font-bold text-sm uppercase tracking-wider hover:shadow-lime-lg hover:scale-[1.03] transition-all duration-300 btn-lime-glow"
                  >
                    {slide.content_type === 'video' && <Play className="w-4 h-4" />}
                    {slide.cta_text}
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation arrows */}
      {isCarousel && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20 hover:border-lime/30 transition-all"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20 hover:border-lime/30 transition-all"
            aria-label="Next slide"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Slide indicators */}
      {isCarousel && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i, i > current ? 1 : -1)}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === current
                  ? 'bg-lime w-8'
                  : 'bg-white/30 w-1.5 hover:bg-white/50'
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// HeroBeforeAfter — inline before/after slider for the hero carousel
// ---------------------------------------------------------------------------

function HeroBeforeAfter({
  beforeSrc,
  afterSrc,
  beforeLabel,
  afterLabel,
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel: string;
  afterLabel: string;
}) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.min(98, Math.max(2, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-col-resize select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        e.preventDefault();
        updatePosition(e.clientX);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0) updatePosition(e.clientX);
      }}
    >
      {/* After image (full, behind) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterSrc}
        alt={afterLabel}
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* Before image (clipped) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeSrc}
        alt={beforeLabel}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        draggable={false}
      />

      {/* Divider */}
      <div
        className="absolute top-0 bottom-0 z-10 pointer-events-none"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        <div className="w-[3px] h-full bg-lime shadow-[0_0_8px_rgba(204,255,0,0.4)]" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-black border-2 border-lime shadow-2xl flex items-center justify-center">
          <div className="flex items-center gap-0.5">
            <svg className="w-3 h-3 text-lime rotate-180" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
            </svg>
            <svg className="w-3 h-3 text-lime" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Labels */}
      <div
        className="pointer-events-none absolute top-4 left-4 z-20 transition-opacity duration-200"
        style={{ opacity: position > 10 ? 1 : 0 }}
      >
        <span className="bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full text-white text-xs font-bold uppercase tracking-wider">
          {beforeLabel}
        </span>
      </div>
      <div
        className="pointer-events-none absolute top-4 right-4 z-20 transition-opacity duration-200"
        style={{ opacity: position < 90 ? 1 : 0 }}
      >
        <span className="bg-lime/90 backdrop-blur-sm px-3 py-1.5 rounded-full text-site-text-on-primary text-xs font-bold uppercase tracking-wider">
          {afterLabel}
        </span>
      </div>
    </div>
  );
}
