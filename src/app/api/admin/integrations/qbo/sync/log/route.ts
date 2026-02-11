import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSyncLog, clearSyncLog } from '@/lib/qbo/sync-log';

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const entries = await getSyncLog(limit, offset);

    // Optional filters
    const statusFilter = searchParams.get('status');
    const entityTypeFilter = searchParams.get('entity_type');

    let filtered = entries;
    if (statusFilter) {
      filtered = filtered.filter((e) => e.status === statusFilter);
    }
    if (entityTypeFilter) {
      filtered = filtered.filter((e) => e.entity_type === entityTypeFilter);
    }

    return NextResponse.json({ data: filtered });
  } catch (err) {
    console.error('[QBO Sync Log] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch sync log' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await clearSyncLog();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[QBO Sync Log Clear] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to clear sync log' },
      { status: 500 }
    );
  }
}
