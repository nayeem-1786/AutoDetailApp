import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** GET — return logged-in customer's contact & address for checkout auto-fill */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ customer: null });
    }

    const admin = createAdminClient();
    const { data: customer } = await admin
      .from('customers')
      .select(
        'id, first_name, last_name, email, phone, address_line_1, address_line_2, city, state, zip'
      )
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ customer: null });
    }

    return NextResponse.json({ customer });
  } catch {
    return NextResponse.json({ customer: null });
  }
}
