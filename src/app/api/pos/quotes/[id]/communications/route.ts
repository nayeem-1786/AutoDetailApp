import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createAdminClient();

    const { data: communications, error } = await supabase
      .from('quote_communications')
      .select('*')
      .eq('quote_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching communications:', error.message);
      return NextResponse.json({ error: 'Failed to fetch communications' }, { status: 500 });
    }

    return NextResponse.json({ communications: communications || [] });
  } catch (err) {
    console.error('POS Quote communications GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
