import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/authorize/[token]/decline
 * Decline an addon authorization. Public — no auth required.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createAdminClient();

    // Fetch addon
    const { data: addon, error: fetchError } = await supabase
      .from('job_addons')
      .select('id, status, expires_at')
      .eq('authorization_token', token)
      .single();

    if (fetchError || !addon) {
      return NextResponse.json({ error: 'Authorization not found' }, { status: 404 });
    }

    if (addon.status !== 'pending') {
      return NextResponse.json(
        { error: `This authorization has already been ${addon.status}`, status: addon.status },
        { status: 409 }
      );
    }

    // Check expiration
    if (addon.expires_at && new Date(addon.expires_at) < new Date()) {
      await supabase
        .from('job_addons')
        .update({ status: 'expired', responded_at: new Date().toISOString() })
        .eq('id', addon.id);
      return NextResponse.json(
        { error: 'This authorization has expired', status: 'expired' },
        { status: 410 }
      );
    }

    // Decline
    const { error: updateError } = await supabase
      .from('job_addons')
      .update({
        status: 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('id', addon.id);

    if (updateError) {
      console.error('Decline error:', updateError);
      return NextResponse.json({ error: 'Failed to decline' }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: 'declined' });
  } catch (err) {
    console.error('Decline route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
