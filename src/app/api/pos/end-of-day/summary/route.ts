import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get optional date param, default to today
    const dateParam = request.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Calculate date range for the day
    const dateParts = dateParam.split('-').map(Number);
    const dayStart = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]).toISOString();
    const dayEnd = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 23, 59, 59).toISOString();

    // Fetch transactions for the day
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id, total_amount, subtotal, tax_amount, tip_amount, discount_amount, payment_method, status')
      .gte('transaction_date', dayStart)
      .lte('transaction_date', dayEnd)
      .in('status', ['completed', 'partial_refund', 'refunded']);

    if (txError) {
      console.error('EOD summary transactions fetch error:', txError);
      return NextResponse.json(
        { error: 'Failed to fetch transactions' },
        { status: 500 }
      );
    }

    const txList = transactions ?? [];
    const transactionIds = txList.map((t) => t.id);

    // Fetch payments for these transactions
    let paymentsList: { method: string; amount: number; tip_amount: number }[] = [];
    if (transactionIds.length > 0) {
      const { data: payments, error: payError } = await supabase
        .from('payments')
        .select('method, amount, tip_amount')
        .in('transaction_id', transactionIds);

      if (payError) {
        console.error('EOD summary payments fetch error:', payError);
      } else {
        paymentsList = payments ?? [];
      }
    }

    // Fetch refunds for these transactions
    let refundsList: { amount: number; status: string }[] = [];
    if (transactionIds.length > 0) {
      const { data: refunds, error: refError } = await supabase
        .from('refunds')
        .select('amount, status')
        .in('transaction_id', transactionIds)
        .eq('status', 'processed');

      if (refError) {
        console.error('EOD summary refunds fetch error:', refError);
      } else {
        refundsList = refunds ?? [];
      }
    }

    // Calculate totals
    const totalRevenue = txList.reduce((sum, t) => sum + (t.total_amount || 0), 0);
    const totalSubtotal = txList.reduce((sum, t) => sum + (t.subtotal || 0), 0);
    const totalTax = txList.reduce((sum, t) => sum + (t.tax_amount || 0), 0);
    const totalTips = txList.reduce((sum, t) => sum + (t.tip_amount || 0), 0);
    const totalDiscounts = txList.reduce((sum, t) => sum + (t.discount_amount || 0), 0);
    const totalRefunds = refundsList.reduce((sum, r) => sum + (r.amount || 0), 0);

    // Calculate payments by method
    const paymentsByMethod: Record<string, { count: number; amount: number; tips: number }> = {
      cash: { count: 0, amount: 0, tips: 0 },
      card: { count: 0, amount: 0, tips: 0 },
    };

    for (const p of paymentsList) {
      const method = p.method === 'cash' ? 'cash' : 'card';
      if (!paymentsByMethod[method]) {
        paymentsByMethod[method] = { count: 0, amount: 0, tips: 0 };
      }
      paymentsByMethod[method].count += 1;
      paymentsByMethod[method].amount += p.amount || 0;
      paymentsByMethod[method].tips += p.tip_amount || 0;
    }

    // Round helper
    const roundTwo = (n: number) => Math.round(n * 100) / 100;

    return NextResponse.json({
      data: {
        date: dateParam,
        total_transactions: txList.length,
        total_revenue: roundTwo(totalRevenue),
        total_subtotal: roundTwo(totalSubtotal),
        total_tax: roundTwo(totalTax),
        total_tips: roundTwo(totalTips),
        total_discounts: roundTwo(totalDiscounts),
        total_refunds: roundTwo(totalRefunds),
        payments_by_method: {
          cash: {
            count: paymentsByMethod.cash.count,
            amount: roundTwo(paymentsByMethod.cash.amount),
            tips: roundTwo(paymentsByMethod.cash.tips),
          },
          card: {
            count: paymentsByMethod.card.count,
            amount: roundTwo(paymentsByMethod.card.amount),
            tips: roundTwo(paymentsByMethod.card.tips),
          },
        },
      },
    });
  } catch (err) {
    console.error('EOD summary route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
