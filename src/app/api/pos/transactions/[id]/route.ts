import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    return NextResponse.json({ data: transaction });
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
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
