import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const supabase = createAdminClient();

  // Lookup + increment click in one atomic call
  const { data, error } = await supabase.rpc('increment_short_link_click', {
    p_code: code,
  });

  const link = data?.[0];
  if (error || !link) {
    return NextResponse.redirect(new URL('/', appUrl));
  }

  // Check expiration
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.redirect(new URL('/', appUrl));
  }

  return NextResponse.redirect(link.target_url, 302);
}
