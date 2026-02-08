import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendQuote } from '@/lib/quotes/send-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const method: 'email' | 'sms' | 'both' = body.method || 'both';

    const supabase = createAdminClient();
    const result = await sendQuote(supabase, id, method);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('POS Quote send error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
