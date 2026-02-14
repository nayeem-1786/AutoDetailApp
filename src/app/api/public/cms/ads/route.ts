import { NextResponse } from 'next/server';
import { getAdsForZone } from '@/lib/data/cms';

// ---------------------------------------------------------------------------
// GET /api/public/cms/ads — Public: get ad for a specific zone
// Query params: ?zone=X&page=Y
// No auth required.
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zone = searchParams.get('zone');
  const page = searchParams.get('page');

  if (!zone || !page) {
    return NextResponse.json(
      { error: 'Missing required query params: zone, page' },
      { status: 400 }
    );
  }

  const result = await getAdsForZone(page, zone);

  return NextResponse.json({ data: result });
}
