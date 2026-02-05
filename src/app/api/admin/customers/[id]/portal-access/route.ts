import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// DELETE - Deactivate portal access (unlink auth user from customer)
export async function DELETE(
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

    // Fetch customer to verify they have portal access
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, auth_user_id')
      .eq('id', id)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    if (!customer.auth_user_id) {
      return NextResponse.json(
        { error: 'Customer does not have portal access' },
        { status: 400 }
      );
    }

    // Unlink auth user from customer (does not delete the auth user)
    const { error: updateError } = await supabase
      .from('customers')
      .update({ auth_user_id: null })
      .eq('id', id);

    if (updateError) {
      console.error('Deactivate portal access error:', updateError);
      return NextResponse.json(
        { error: 'Failed to deactivate portal access' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Portal access endpoint error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
