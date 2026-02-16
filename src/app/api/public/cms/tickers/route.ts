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
    const all = await getTopBarTickers();
    data = all.filter((t) => {
      const pages = t.target_pages;
      if (!pages || pages.length === 0) return true;
      return pages.includes('all') || pages.includes(page);
    });
  } else {
    data = await getSectionTickers(page, position ?? undefined);
  }

  return NextResponse.json({ data });
}
