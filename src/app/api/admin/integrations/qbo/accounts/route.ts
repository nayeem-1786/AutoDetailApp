import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { QboClient } from '@/lib/qbo/client';
import type { QboAccount } from '@/lib/qbo/types';

export async function GET() {
  try {
    // Auth check
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: employee } = await authClient
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const client = new QboClient();
    const allAccounts = await client.getAccounts();

    const income: QboAccount[] = [];
    const bank: QboAccount[] = [];

    for (const account of allAccounts) {
      if (account.AccountType === 'Income') {
        income.push(account);
      } else if (account.AccountType === 'Bank') {
        bank.push(account);
      }
    }

    return NextResponse.json({ income, bank });
  } catch (err) {
    console.error('QBO accounts error:', err);
    return NextResponse.json({ error: 'Failed to fetch QBO accounts' }, { status: 500 });
  }
}
