import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { emailVerifyCodeSchema } from '@/lib/utils/validation';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = emailVerifyCodeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email: rawEmail, code } = parsed.data;
    const email = rawEmail.toLowerCase().trim();

    const admin = createAdminClient();

    // Find customer for this auth user
    const { data: customer } = await admin
      .from('customers')
      .select('id, auth_user_id, email')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Find the most recent pending verification record
    const { data: record } = await admin
      .from('email_verification_codes')
      .select('id, code, attempts')
      .eq('customer_id', customer.id)
      .eq('email', email)
      .is('verified_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!record) {
      return NextResponse.json(
        { error: 'No pending verification for this email. Please request a new code.' },
        { status: 400 }
      );
    }

    if (record.attempts >= 5) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new code.' },
        { status: 400 }
      );
    }

    if (record.code !== code) {
      // Increment attempts
      await admin
        .from('email_verification_codes')
        .update({ attempts: record.attempts + 1 })
        .eq('id', record.id);

      const remaining = 5 - (record.attempts + 1);
      return NextResponse.json(
        { error: `Invalid code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` },
        { status: 400 }
      );
    }

    // Code matches — mark as verified
    await admin
      .from('email_verification_codes')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', record.id);

    // Update customer email + verification timestamp + auto-enable email consent
    await admin
      .from('customers')
      .update({
        email,
        email_verified_at: new Date().toISOString(),
        email_consent: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customer.id);

    // If email-auth user and email changed, update Supabase auth email
    const providers = user.app_metadata?.providers as string[] | undefined;
    const isEmailAuth = user.app_metadata?.provider === 'email' ||
      (Array.isArray(providers) && providers.includes('email'));

    if (isEmailAuth && customer.email && customer.email.toLowerCase() !== email) {
      try {
        await admin.auth.admin.updateUserById(user.id, { email });
      } catch (authErr) {
        console.error('Failed to update Supabase auth email:', authErr);
        // Non-blocking — customer record is already updated
      }
    }

    // Cleanup: delete all other pending verification records for this customer
    await admin
      .from('email_verification_codes')
      .delete()
      .eq('customer_id', customer.id)
      .is('verified_at', null)
      .neq('id', record.id);

    return NextResponse.json({ message: 'Email verified successfully', email });
  } catch (err) {
    console.error('Verify email code error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
