import { NextResponse } from 'next/server';
import { getActiveHeroSlides, getHeroCarouselConfig } from '@/lib/data/cms';

// ---------------------------------------------------------------------------
// GET /api/public/cms/hero — Public: active hero slides + config
// ---------------------------------------------------------------------------

export async function GET() {
  const [slides, config] = await Promise.all([
    getActiveHeroSlides(),
    getHeroCarouselConfig(),
  ]);

  return NextResponse.json({ slides, config });
}
