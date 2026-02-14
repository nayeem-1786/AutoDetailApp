import { NextResponse } from 'next/server';
import { getTopBarTickers, getSectionTickers } from '@/lib/data/cms';

// ---------------------------------------------------------------------------
// GET /api/public/cms/tickers?placement=top_bar&page=/
// Public: active tickers for a page
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placement = searchParams.get('placement') ?? 'top_bar';
  const page = searchParams.get('page') ?? '/';
  const position = searchParams.get('position') ?? undefined;

  let data;
  if (placement === 'top_bar') {
    data = await getTopBarTickers(page);
  } else {
    data = await getSectionTickers(page, position ?? undefined);
  }

  return NextResponse.json({ data });
}
