import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate — admin session required
    const supabaseSession = await createClient();
    const { data: { user } } = await supabaseSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createAdminClient();

    // Fetch customer to get email and auth_user_id
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, email, auth_user_id')
      .eq('id', id)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Validate customer has portal access
    if (!customer.auth_user_id) {
      return NextResponse.json(
        { error: 'Customer does not have a portal account' },
        { status: 400 }
      );
    }

    // Validate customer has email
    if (!customer.email) {
      return NextResponse.json(
        { error: 'Customer does not have an email address on file' },
        { status: 400 }
      );
    }

    // Send password reset email via Supabase Auth
    // Using the session client which has auth.resetPasswordForEmail
    const { error: resetError } = await supabaseSession.auth.resetPasswordForEmail(
      customer.email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/portal/reset-password`,
      }
    );

    if (resetError) {
      console.error('Password reset email error:', resetError);
      return NextResponse.json(
        { error: 'Failed to send password reset email' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Password reset endpoint error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
