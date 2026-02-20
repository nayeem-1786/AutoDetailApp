import { NextRequest, NextResponse } from 'next/server';
import { cleanupIdempotencyKeys } from '@/lib/utils/idempotency';

const CRON_API_KEY = process.env.CRON_API_KEY;

/**
 * Cleanup expired idempotency keys (older than 24 hours).
 * Runs daily at 3 AM PST (11:00 UTC).
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!CRON_API_KEY || apiKey !== CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const deleted = await cleanupIdempotencyKeys();
    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error('[CRON] cleanup-idempotency failed:', error);
    return NextResponse.json(
      { error: 'Cleanup failed' },
      { status: 500 }
    );
  }
}
