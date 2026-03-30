import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { declineAddon } from '@/lib/services/job-addons';

/**
 * POST /api/authorize/[token]/decline
 * Decline an addon authorization. Public — no auth required.
 * Delegates to declineAddon() which handles DB update + SMS notification.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createAdminClient();

    // Resolve token → addon ID
    const { data: addon, error: fetchError } = await supabase
      .from('job_addons')
      .select('id')
      .eq('authorization_token', token)
      .single();

    if (fetchError || !addon) {
      return NextResponse.json({ error: 'Authorization not found' }, { status: 404 });
    }

    // Delegate to service layer (validates status, checks expiry, updates DB, sends SMS)
    const result = await declineAddon(addon.id);

    if (!result.success) {
      if (result.expired) {
        return NextResponse.json(
          { error: 'This authorization has expired', status: 'expired' },
          { status: 410 }
        );
      }
      return NextResponse.json(
        { error: result.error, status: 'error' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, status: 'declined' });
  } catch (err) {
    console.error('Decline route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
