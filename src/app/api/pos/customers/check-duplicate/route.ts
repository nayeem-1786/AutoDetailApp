import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

export async function GET(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const email = searchParams.get('email');

    if (!phone && !email) {
      return NextResponse.json({ exists: false });
    }

    const supabase = createAdminClient();

    // Check phone
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 10) {
        // Normalize to +1XXXXXXXXXX format for exact match
        const normalized = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits[0] === '1' ? `+${digits}` : null;
        if (normalized) {
          const { data: match } = await supabase
            .from('customers')
            .select('id, first_name, last_name')
            .eq('phone', normalized)
            .maybeSingle();

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
        const { data: match } = await supabase
          .from('customers')
          .select('id, first_name, last_name')
          .ilike('email', normalizedEmail)
          .maybeSingle();

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
    console.error('POS check-duplicate error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
