import { NextResponse } from 'next/server';
import { getActiveTheme } from '@/lib/data/cms';

// ---------------------------------------------------------------------------
// GET /api/public/cms/theme — Public: active theme data
// ---------------------------------------------------------------------------

export async function GET() {
  const theme = await getActiveTheme();
  return NextResponse.json({ data: theme });
}
