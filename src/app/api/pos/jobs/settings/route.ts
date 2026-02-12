import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

/**
 * GET /api/pos/jobs/settings — Get job-related business settings
 * Returns min photo counts and other configurable values
 */
export async function GET(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const settingsKeys = [
      'min_intake_photos_exterior',
      'min_intake_photos_interior',
      'min_completion_photos_exterior',
      'min_completion_photos_interior',
      'addon_auth_expiration_minutes',
    ];

    const { data: settings, error } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', settingsKeys);

    if (error) {
      console.error('Job settings fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    const result: Record<string, string> = {};
    for (const s of settings ?? []) {
      // business_settings values are stored as JSON strings (e.g. '"4"')
      try {
        result[s.key] = JSON.parse(s.value);
      } catch {
        result[s.key] = s.value;
      }
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('Job settings route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
