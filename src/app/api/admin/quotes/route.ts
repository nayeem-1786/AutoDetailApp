import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listQuotesAdmin, getQuoteSentCounts } from '@/lib/quotes/quote-service';

export async function GET(request: NextRequest) {
  try {
    // Auth: session + employee role check
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: employee } = await authClient
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const result = await listQuotesAdmin(supabase, {
      status: searchParams.get('status'),
      search: searchParams.get('search'),
      dateFrom: searchParams.get('date_from'),
      dateTo: searchParams.get('date_to'),
      createdBy: searchParams.get('created_by'),
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '50', 10),
    });

    // Fetch sent counts for the returned quotes
    const quoteIds = result.quotes
      .map((q) => (q as { id?: string }).id)
      .filter((id): id is string => !!id);

    const sentCounts = await getQuoteSentCounts(supabase, quoteIds);

    return NextResponse.json({
      quotes: result.quotes,
      total: result.total,
      page: result.page,
      limit: result.limit,
      sentCounts,
    });
  } catch (err) {
    console.error('Admin quotes GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
