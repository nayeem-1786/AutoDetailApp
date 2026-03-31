import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { error } = await admin
      .from('customers')
      .update({ email_prompt_dismissed_at: new Date().toISOString() })
      .eq('auth_user_id', user.id);

    if (error) {
      console.error('Dismiss email prompt failed:', error.message);
      return NextResponse.json({ error: 'Failed to dismiss' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Dismiss email prompt error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
