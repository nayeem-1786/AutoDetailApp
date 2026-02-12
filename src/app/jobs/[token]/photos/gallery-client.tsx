'use client';

import { BeforeAfterSlider } from '@/components/before-after-slider';

interface GalleryClientProps {
  beforeSrc: string;
  afterSrc: string;
}

export function GalleryClient({ beforeSrc, afterSrc }: GalleryClientProps) {
  return <BeforeAfterSlider beforeSrc={beforeSrc} afterSrc={afterSrc} />;
}
