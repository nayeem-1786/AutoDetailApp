import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { cashDrawerCloseSchema } from '@/lib/utils/validation';

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = cashDrawerCloseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Check for open cash drawer
    const { data: openDrawer } = await supabase
      .from('cash_drawers')
      .select('*')
      .is('closed_at', null)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Calculate day summary
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

    // Fetch today's completed transactions
    const { data: transactions } = await supabase
      .from('transactions')
      .select('total_amount, tax_amount, tip_amount, payment_method, status')
      .gte('transaction_date', todayStart)
      .lte('transaction_date', todayEnd)
      .in('status', ['completed', 'partial_refund']);

    const txList = transactions ?? [];
    const totalTransactions = txList.length;
    const totalRevenue = txList.reduce((sum, t) => sum + (t.total_amount || 0), 0);
    const totalTax = txList.reduce((sum, t) => sum + (t.tax_amount || 0), 0);
    const totalTips = txList.reduce((sum, t) => sum + (t.tip_amount || 0), 0);

    // Cash sales from transactions where payment_method is cash
    const cashSales = txList
      .filter((t) => t.payment_method === 'cash')
      .reduce((sum, t) => sum + (t.total_amount || 0), 0);

    // Cash tips from payments table
    const { data: cashPayments } = await supabase
      .from('payments')
      .select('tip_amount')
      .eq('method', 'cash')
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd);

    const cashTips = (cashPayments ?? []).reduce((sum, p) => sum + (p.tip_amount || 0), 0);

    // Cash refunds: refunds on transactions that were paid with cash
    // Fetch today's refunds
    const { data: todayRefunds } = await supabase
      .from('refunds')
      .select('amount, transaction_id')
      .eq('status', 'processed')
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd);

    let cashRefundsTotal = 0;
    const totalRefundsAmount = (todayRefunds ?? []).reduce((sum, r) => sum + (r.amount || 0), 0);

    if (todayRefunds && todayRefunds.length > 0) {
      // Check which refunded transactions were cash
      const refundTxIds = [...new Set(todayRefunds.map((r) => r.transaction_id))];
      const { data: refundTxs } = await supabase
        .from('transactions')
        .select('id, payment_method')
        .in('id', refundTxIds);

      const cashTxIds = new Set(
        (refundTxs ?? [])
          .filter((t) => t.payment_method === 'cash')
          .map((t) => t.id)
      );

      cashRefundsTotal = todayRefunds
        .filter((r) => cashTxIds.has(r.transaction_id))
        .reduce((sum, r) => sum + (r.amount || 0), 0);
    }

    // Calculate expected cash
    const openingAmount = openDrawer?.opening_amount ?? 0;
    const expectedCash = openingAmount + cashSales + cashTips - cashRefundsTotal;
    const variance = data.counted_cash - expectedCash;

    // Round values for precision
    const roundTwo = (n: number) => Math.round(n * 100) / 100;

    const drawerData = {
      closed_at: new Date().toISOString(),
      counted_cash: data.counted_cash,
      expected_cash: roundTwo(expectedCash),
      variance: roundTwo(variance),
      deposit_amount: data.deposit_amount,
      next_day_float: data.next_day_float,
      cash_sales: roundTwo(cashSales),
      cash_tips: roundTwo(cashTips),
      cash_refunds: roundTwo(cashRefundsTotal),
      total_transactions: totalTransactions,
      total_revenue: roundTwo(totalRevenue),
      total_tax: roundTwo(totalTax),
      total_tips: roundTwo(totalTips),
      total_refunds: roundTwo(totalRefundsAmount),
      closed_by: posEmployee.employee_id,
      notes: data.notes || null,
    };

    let drawer;

    if (openDrawer) {
      // Update existing open drawer
      const { data: updated, error: updateErr } = await supabase
        .from('cash_drawers')
        .update(drawerData)
        .eq('id', openDrawer.id)
        .select('*')
        .single();

      if (updateErr) {
        console.error('Cash drawer update error:', updateErr);
        return NextResponse.json(
          { error: 'Failed to close cash drawer' },
          { status: 500 }
        );
      }

      drawer = updated;
    } else {
      // Insert a new closed drawer row
      const { data: inserted, error: insertErr } = await supabase
        .from('cash_drawers')
        .insert({
          ...drawerData,
          opened_at: todayStart,
          opening_amount: 0,
        })
        .select('*')
        .single();

      if (insertErr) {
        console.error('Cash drawer insert error:', insertErr);
        return NextResponse.json(
          { error: 'Failed to create end-of-day record' },
          { status: 500 }
        );
      }

      drawer = inserted;
    }

    return NextResponse.json({ data: drawer }, { status: 200 });
  } catch (err) {
    console.error('End-of-day route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
