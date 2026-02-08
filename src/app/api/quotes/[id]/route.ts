import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateQuoteSchema } from '@/lib/utils/validation';
import {
  getQuoteById,
  updateQuote,
  softDeleteQuote,
  QuoteNotFoundError,
  QuoteDraftOnlyError,
} from '@/lib/quotes/quote-service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const quote = await getQuoteById(supabase, id);
    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    return NextResponse.json({ quote });
  } catch (err) {
    console.error('Quote GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateQuoteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const updated = await updateQuote(supabase, id, parsed.data);

    return NextResponse.json({ quote: updated });
  } catch (err) {
    if (err instanceof QuoteNotFoundError) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }
    console.error('Quote PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    await softDeleteQuote(supabase, id);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof QuoteNotFoundError) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }
    if (err instanceof QuoteDraftOnlyError) {
      return NextResponse.json(
        { error: 'Only draft quotes can be deleted' },
        { status: 400 }
      );
    }
    console.error('Quote DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
