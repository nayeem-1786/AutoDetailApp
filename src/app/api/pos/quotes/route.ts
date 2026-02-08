import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { createQuoteSchema } from '@/lib/utils/validation';
import { listQuotes, createQuote } from '@/lib/quotes/quote-service';

export async function GET(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const result = await listQuotes(supabase, {
      status: searchParams.get('status'),
      search: searchParams.get('search'),
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
      searchIncludesPhone: true,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('POS Quotes GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createQuoteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const result = await createQuote(supabase, parsed.data, posEmployee.employee_id);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error('POS Quotes POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
