import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const email = searchParams.get('email');
    const excludeId = searchParams.get('excludeId');

    if (!phone && !email) {
      return NextResponse.json({ exists: false });
    }

    // Check phone
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 10) {
        const normalized = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits[0] === '1' ? `+${digits}` : null;
        if (normalized) {
          let query = admin
            .from('customers')
            .select('id, first_name, last_name')
            .eq('phone', normalized);
          if (excludeId) query = query.neq('id', excludeId);
          const { data: match } = await query.maybeSingle();

          if (match) {
            return NextResponse.json({
              exists: true,
              field: 'phone',
              match: { id: match.id, first_name: match.first_name, last_name: match.last_name },
            });
          }
        }
      }
    }

    // Check email
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      if (normalizedEmail.includes('@')) {
        let query = admin
          .from('customers')
          .select('id, first_name, last_name')
          .ilike('email', normalizedEmail);
        if (excludeId) query = query.neq('id', excludeId);
        const { data: match } = await query.maybeSingle();

        if (match) {
          return NextResponse.json({
            exists: true,
            field: 'email',
            match: { id: match.id, first_name: match.first_name, last_name: match.last_name },
          });
        }
      }
    }

    return NextResponse.json({ exists: false });
  } catch (err) {
    console.error('Admin check-duplicate error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
