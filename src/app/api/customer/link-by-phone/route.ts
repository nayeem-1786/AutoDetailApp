import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// POST - Link authenticated user to existing customer by phone number
export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user from session
    const supabaseSession = await createClient();
    const { data: { user } } = await supabaseSession.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
    }

    // Use admin client to bypass RLS
    const supabase = createAdminClient();

    // Check if user is already linked to a customer
    const { data: existingLink } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (existingLink) {
      return NextResponse.json({
        success: true,
        customer_id: existingLink.id,
        already_linked: true
      });
    }

    // Try to find customer by phone (multiple formats)
    const digits = phone.replace(/\D/g, '').slice(-10);
    const e164 = `+1${digits}`;
    const formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    const phoneFormats = [e164, digits, `+1${digits}`, formatted];

    console.log('[link-by-phone] Searching with formats:', phoneFormats);

    let customer: { id: string; auth_user_id: string | null } | null = null;

    for (const phoneFormat of phoneFormats) {
      // Use limit(1) instead of maybeSingle to handle duplicates
      const { data, error } = await supabase
        .from('customers')
        .select('id, auth_user_id, phone')
        .eq('phone', phoneFormat)
        .order('created_at', { ascending: true }) // Pick oldest record
        .limit(1);

      console.log(`[link-by-phone] Query "${phoneFormat}":`, data, error);

      if (data && data.length > 0) {
        customer = data[0];
        break;
      }
    }

    // Also try a broader search to debug
    if (!customer) {
      const { data: allWithDigits } = await supabase
        .from('customers')
        .select('id, phone')
        .ilike('phone', `%${digits.slice(-7)}%`)
        .limit(5);
      console.log('[link-by-phone] Broad search (last 7 digits):', allWithDigits);
    }

    if (!customer) {
      return NextResponse.json({
        found: false,
        message: 'No customer found with this phone number'
      });
    }

    if (customer.auth_user_id && customer.auth_user_id !== user.id) {
      return NextResponse.json({
        error: 'This phone number is already linked to another account'
      }, { status: 400 });
    }

    if (customer.auth_user_id === user.id) {
      return NextResponse.json({
        success: true,
        customer_id: customer.id,
        already_linked: true
      });
    }

    // Link the customer to this auth user
    const { error: linkError } = await supabase
      .from('customers')
      .update({ auth_user_id: user.id })
      .eq('id', customer.id);

    if (linkError) {
      console.error('Failed to link customer:', linkError);
      return NextResponse.json({
        error: 'Failed to link account'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      customer_id: customer.id,
      linked: true
    });
  } catch (err) {
    console.error('Link by phone error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
