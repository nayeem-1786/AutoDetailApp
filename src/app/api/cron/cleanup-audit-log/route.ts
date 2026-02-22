import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const CRON_API_KEY = process.env.CRON_API_KEY;

/**
 * Cleanup audit log entries older than 90 days.
 * Runs daily at 3:30 AM PST (11:30 UTC).
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!CRON_API_KEY || apiKey !== CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { error, data } = await admin
      .from('audit_log')
      .delete()
      .lt('created_at', ninetyDaysAgo)
      .select('id');

    if (error) {
      console.error('[cleanup-audit-log] Delete error:', error);
      return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }

    const deleted = data?.length || 0;
    console.log(`[cleanup-audit-log] Deleted ${deleted} entries older than 90 days`);
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    console.error('[CRON] cleanup-audit-log failed:', err);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
