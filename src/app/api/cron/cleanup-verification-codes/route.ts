import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const CRON_API_KEY = process.env.CRON_API_KEY;

/**
 * Cleanup expired email verification codes older than 24 hours.
 * Runs daily at 4 AM PST (12 PM UTC).
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!CRON_API_KEY || apiKey !== CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { error, data } = await admin
      .from('email_verification_codes')
      .delete()
      .lt('created_at', twentyFourHoursAgo)
      .select('id');

    if (error) {
      console.error('[cleanup-verification-codes] Delete error:', error);
      return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }

    const deleted = data?.length || 0;
    console.log(`[cleanup-verification-codes] Deleted ${deleted} entries older than 24 hours`);
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    console.error('[CRON] cleanup-verification-codes failed:', err);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
