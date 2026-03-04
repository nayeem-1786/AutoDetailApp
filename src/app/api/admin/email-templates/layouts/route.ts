import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// GET /api/admin/email-templates/layouts — List all layouts
export async function GET(_request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('email_layouts')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name');

    if (error) throw error;

    return NextResponse.json({ data }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    console.error('[admin/email-templates/layouts] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
