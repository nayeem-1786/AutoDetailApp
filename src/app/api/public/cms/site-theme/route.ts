import { NextResponse } from 'next/server';
import { getSiteThemeSettings } from '@/lib/data/cms';

// ---------------------------------------------------------------------------
// GET /api/public/cms/site-theme — Public endpoint for site theme settings
// No auth required. Used by client components needing theme data.
// ---------------------------------------------------------------------------

export async function GET() {
  const theme = await getSiteThemeSettings();
  return NextResponse.json({ data: theme }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
