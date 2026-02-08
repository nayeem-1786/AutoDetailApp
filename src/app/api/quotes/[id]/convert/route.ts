import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { convertQuote } from '@/lib/quotes/convert-service';
import { convertSchema } from '@/lib/utils/validation';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = convertSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const result = await convertQuote(supabase, id, parsed.data);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, ...(result.details ? { details: result.details } : {}) },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('Quote convert error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
