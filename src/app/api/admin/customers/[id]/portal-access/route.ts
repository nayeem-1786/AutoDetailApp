import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// POST - Activate/Reactivate portal access
// 1. First tries to restore from deactivated_auth_user_id backup
// 2. If no backup, searches auth.users for matching email/phone
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

    // Fetch customer details (deactivated_auth_user_id may not exist yet)
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, auth_user_id, email, phone')
      .eq('id', id)
      .single();

    if (customerError || !customer) {
      console.error('Customer fetch error:', customerError);
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Try to get deactivated_auth_user_id if column exists
    let deactivatedAuthUserId: string | null = null;
    try {
      const { data: extendedCustomer } = await supabase
        .from('customers')
        .select('deactivated_auth_user_id')
        .eq('id', id)
        .single();
      deactivatedAuthUserId = extendedCustomer?.deactivated_auth_user_id ?? null;
    } catch {
      // Column may not exist yet - that's fine
    }

    if (customer.auth_user_id) {
      return NextResponse.json(
        { error: 'Customer already has active portal access' },
        { status: 400 }
      );
    }

    let authUserIdToLink: string | null = null;

    // Strategy 1: Restore from backup
    if (deactivatedAuthUserId) {
      authUserIdToLink = deactivatedAuthUserId;
    }

    // Strategy 2: Find matching auth user by email
    if (!authUserIdToLink && customer.email) {
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const matchingUser = authUsers?.users?.find(
        (u) => u.email?.toLowerCase() === customer.email?.toLowerCase()
      );
      if (matchingUser) {
        authUserIdToLink = matchingUser.id;
      }
    }

    // Strategy 3: Find matching auth user by phone
    if (!authUserIdToLink && customer.phone) {
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const matchingUser = authUsers?.users?.find(
        (u) => u.phone === customer.phone
      );
      if (matchingUser) {
        authUserIdToLink = matchingUser.id;
      }
    }

    if (!authUserIdToLink) {
      return NextResponse.json(
        { error: 'No matching portal account found. Customer must sign up through the portal first.' },
        { status: 400 }
      );
    }

    // Link the auth user to the customer
    // Try with clearing backup column first, fall back to just setting auth_user_id
    let updateError = null;

    const { error: fullUpdateError } = await supabase
      .from('customers')
      .update({
        auth_user_id: authUserIdToLink,
        deactivated_auth_user_id: null,
      })
      .eq('id', id);

    if (fullUpdateError) {
      // Backup column might not exist, try without it
      console.log('Backup column may not exist, trying without:', fullUpdateError.message);
      const { error: simpleError } = await supabase
        .from('customers')
        .update({ auth_user_id: authUserIdToLink })
        .eq('id', id);
      updateError = simpleError;
    }

    if (updateError) {
      console.error('Activate portal access error:', updateError);
      return NextResponse.json(
        { error: 'Failed to activate portal access' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      auth_user_id: authUserIdToLink,
    });
  } catch (err) {
    console.error('Portal access endpoint error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Deactivate portal access (backup and unlink auth user from customer)
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

    // Try to backup auth_user_id and unlink
    // First try with backup column, fall back to just unlinking if column doesn't exist
    let updateError = null;

    // Try with backup column
    const { error: backupError } = await supabase
      .from('customers')
      .update({
        deactivated_auth_user_id: customer.auth_user_id,
        auth_user_id: null,
      })
      .eq('id', id);

    if (backupError) {
      // Backup column might not exist, try without it
      console.log('Backup column may not exist, trying without:', backupError.message);
      const { error: simpleError } = await supabase
        .from('customers')
        .update({ auth_user_id: null })
        .eq('id', id);
      updateError = simpleError;
    }

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
