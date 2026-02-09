import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single();

  if (!employee || !['super_admin', 'admin', 'cashier', 'detailer'].includes(employee.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'open';
  const search = searchParams.get('search') || '';
  const filter = searchParams.get('filter') || 'all'; // all, unread, unknown, customers

  let query = admin
    .from('conversations')
    .select('*, customer:customers(id, first_name, last_name, phone, email)')
    .eq('status', status)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (filter === 'unread') {
    query = query.gt('unread_count', 0);
  } else if (filter === 'unknown') {
    query = query.is('customer_id', null);
  } else if (filter === 'customers') {
    query = query.not('customer_id', 'is', null);
  }

  const { data: conversations, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Client-side search filtering if search term provided
  let filtered = conversations || [];
  if (search.length >= 2) {
    const digits = search.replace(/\D/g, '');
    const isPhone = digits.length > 0 && digits.length === search.replace(/[\s()-]/g, '').length;

    if (isPhone) {
      filtered = filtered.filter((c) => c.phone_number.includes(digits));
    } else {
      const term = search.toLowerCase();
      filtered = filtered.filter((c) => {
        if (c.customer) {
          const name = `${c.customer.first_name} ${c.customer.last_name}`.toLowerCase();
          return name.includes(term);
        }
        return c.phone_number.includes(term);
      });
    }
  }

  return NextResponse.json({ data: filtered });
}
