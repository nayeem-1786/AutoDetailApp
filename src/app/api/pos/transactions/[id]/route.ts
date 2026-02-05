import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { fetchReceiptConfig } from '@/lib/data/receipt-config';

async function authenticate(request: NextRequest): Promise<boolean> {
  const posEmployee = authenticatePosRequest(request);
  if (posEmployee) return true;
  const supabaseSession = await createClient();
  const { data: { user } } = await supabaseSession.auth.getUser();
  return !!user;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!await authenticate(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const { data: transaction, error } = await supabase
      .from('transactions')
      .select(`
        *,
        customer:customers(id, first_name, last_name, phone, email),
        vehicle:vehicles(id, year, make, model, color, size_class),
        employee:employees(id, first_name, last_name),
        items:transaction_items(*),
        payments(*)
      `)
      .eq('id', id)
      .single();

    if (error || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Fetch receipt config so callers can render branded receipts
    const { merged: receipt_config } = await fetchReceiptConfig(supabase);

    return NextResponse.json({ data: transaction, receipt_config });
  } catch (err) {
    console.error('Transaction GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!await authenticate(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const { action } = body;

    if (action === 'void') {
      const { data: transaction, error } = await supabase
        .from('transactions')
        .update({ status: 'voided' })
        .eq('id', id)
        .eq('status', 'completed')
        .select('*')
        .single();

      if (error || !transaction) {
        return NextResponse.json(
          { error: 'Transaction not found or already voided' },
          { status: 400 }
        );
      }

      return NextResponse.json({ data: transaction });
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (err) {
    console.error('Transaction PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
