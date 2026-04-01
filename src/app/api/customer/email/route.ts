import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check auth provider — email-auth users cannot remove their email
    const providers = user.app_metadata?.providers as string[] | undefined;
    const isEmailAuth = user.app_metadata?.provider === 'email' ||
      (Array.isArray(providers) && providers.includes('email'));

    if (isEmailAuth) {
      return NextResponse.json(
        { error: 'Cannot remove email used for sign-in' },
        { status: 403 }
      );
    }

    const admin = createAdminClient();

    // Find customer for this auth user
    const { data: customer } = await admin
      .from('customers')
      .select('id, email_consent')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Clear email, verification, and consent
    await admin
      .from('customers')
      .update({
        email: null,
        email_verified_at: null,
        email_consent: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customer.id);

    // Log consent change for compliance
    if (customer.email_consent) {
      await admin.from('marketing_consent_log').insert({
        customer_id: customer.id,
        channel: 'email',
        action: 'opt_out',
        source: 'portal',
      });
    }

    return NextResponse.json({ message: 'Email removed' });
  } catch (err) {
    console.error('Delete email error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
