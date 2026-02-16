'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { HeroSlide, HeroCarouselConfig } from '@/lib/supabase/types';

interface HeroCarouselProps {
  slides: HeroSlide[];
  config: HeroCarouselConfig;
}

export function HeroCarousel({ slides, config }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isCarousel = config.mode === 'carousel' && slides.length > 1;
  const currentSlide = slides[currentIndex];

  const goTo = useCallback(
    (index: number) => {
      if (isTransitioning) return;
      setIsTransitioning(true);
      setCurrentIndex(index);
      setTimeout(() => setIsTransitioning(false), 500);
    },
    [isTransitioning]
  );

  const goNext = useCallback(() => {
    goTo((currentIndex + 1) % slides.length);
  }, [currentIndex, slides.length, goTo]);

  const goPrev = useCallback(() => {
    goTo((currentIndex - 1 + slides.length) % slides.length);
  }, [currentIndex, slides.length, goTo]);

  // Auto-rotate
  useEffect(() => {
    if (!isCarousel || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(goNext, config.interval_ms);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isCarousel, isPaused, goNext, config.interval_ms]);

  if (!currentSlide) return null;

  return (
    <section
      className="relative overflow-hidden bg-gradient-hero"
      onMouseEnter={() => config.pause_on_hover && setIsPaused(true)}
      onMouseLeave={() => config.pause_on_hover && setIsPaused(false)}
    >
      <div className="relative min-h-[400px] sm:min-h-[500px] lg:min-h-[600px]">
        {slides.map((slide, idx) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-500 ${
              idx === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
            }`}
            aria-hidden={idx !== currentIndex}
          >
            <SlideContent slide={slide} isFirst={idx === 0} />
          </div>
        ))}
      </div>

      {/* Navigation arrows */}
      {isCarousel && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white backdrop-blur-sm hover:bg-black/50 transition-colors"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white backdrop-blur-sm hover:bg-black/50 transition-colors"
            aria-label="Next slide"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {isCarousel && (
        <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-2">
          {slides.map((slide, idx) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => goTo(idx)}
              className={`h-2.5 rounded-full transition-all ${
                idx === currentIndex
                  ? 'w-8 bg-white'
                  : 'w-2.5 bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SlideContent({ slide, isFirst }: { slide: HeroSlide; isFirst: boolean }) {
  const alignmentClasses = {
    left: 'text-left items-start',
    center: 'text-center items-center',
    right: 'text-right items-end',
  };

  const alignment = alignmentClasses[slide.text_alignment] ?? alignmentClasses.left;

  return (
    <div className="relative h-full">
      {/* Background media */}
      {slide.content_type === 'image' && slide.image_url && (
        <>
          <picture>
            {slide.image_url_mobile ? (
              <source media="(max-width: 639px)" srcSet={slide.image_url_mobile} />
            ) : null}
            <img
              src={slide.image_url!}
              alt={slide.image_alt || slide.title || ''}
              className="absolute inset-0 h-full w-full object-cover"
              loading={isFirst ? 'eager' : 'lazy'}
            />
          </picture>
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: slide.overlay_opacity / 100 }}
          />
        </>
      )}

      {slide.content_type === 'video' && slide.video_url && (
        <>
          {slide.video_thumbnail_url ? (
            <img
              src={slide.video_thumbnail_url!}
              alt={slide.title || ''}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: slide.overlay_opacity / 100 }}
          />
        </>
      )}

      {slide.content_type === 'before_after' && slide.before_image_url && slide.after_image_url && (
        <div className="absolute inset-0">
          <HeroBeforeAfter
            beforeSrc={slide.before_image_url}
            afterSrc={slide.after_image_url}
            beforeLabel={slide.before_label ?? 'Before'}
            afterLabel={slide.after_label ?? 'After'}
          />
          <div
            className="absolute inset-0 pointer-events-none bg-black"
            style={{ opacity: slide.overlay_opacity / 100 }}
          />
        </div>
      )}

      {/* No background — just gradient */}
      {slide.content_type === 'image' && !slide.image_url && (
        <div className="absolute inset-0 bg-gradient-hero" />
      )}

      {/* Text overlay */}
      <div className="relative z-10 mx-auto flex h-full min-h-[400px] sm:min-h-[500px] lg:min-h-[600px] max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={`flex flex-col justify-center py-16 ${alignment} ${
          slide.content_type === 'before_after' ? 'max-w-md' : 'max-w-2xl'
        }`}>
          {isFirst ? (
            <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              {slide.title}
            </h1>
          ) : (
            <p className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              {slide.title}
            </p>
          )}

          {slide.subtitle && (
            <p className="mt-4 text-lg text-white/80 sm:text-xl">
              {slide.subtitle}
            </p>
          )}

          {slide.cta_text && slide.cta_url && (
            <div className="mt-8">
              <Link
                href={slide.cta_url}
                className="inline-flex items-center rounded-full bg-brand-500 px-8 py-3 text-base font-semibold text-white shadow-lg hover:bg-brand-600 transition-colors"
              >
                {slide.cta_text}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero Before/After Slider — contained within hero dimensions
// Uses absolute-positioned images with object-cover so both images fill the
// hero area identically. A clip-path on the "before" image reveals/hides
// based on the drag position.
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
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const getPosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 50;
    return Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      setPosition(getPosition(e.clientX));
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [getPosition]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      setPosition(getPosition(e.clientX));
    },
    [isDragging, getPosition]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* After image — full background layer */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterSrc}
        alt={afterLabel}
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      {/* Before image — clipped by slider position */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeSrc}
          alt={beforeLabel}
          className="absolute inset-0 h-full w-full object-cover object-center"
          draggable={false}
        />
      </div>

      {/* Draggable divider line */}
      <div
        className="absolute top-0 bottom-0 z-20 w-[3px] bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.4)]"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        {/* Grab handle */}
        <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-white bg-black/50 shadow-lg backdrop-blur-sm cursor-grab active:cursor-grabbing">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 4L3 11L7 18" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 4L19 11L15 18" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Before label — top-left */}
      <div
        className="pointer-events-none absolute top-4 left-4 z-20 transition-opacity duration-200"
        style={{ opacity: position > 10 ? 1 : 0 }}
      >
        <span className="rounded-md bg-black/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
          {beforeLabel}
        </span>
      </div>

      {/* After label — top-right */}
      <div
        className="pointer-events-none absolute top-4 right-4 z-20 transition-opacity duration-200"
        style={{ opacity: position < 90 ? 1 : 0 }}
      >
        <span className="rounded-md bg-black/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
          {afterLabel}
        </span>
      </div>
    </div>
  );
}
