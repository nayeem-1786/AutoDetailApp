import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { LOYALTY } from '@/lib/utils/constants';

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const { customer_id, points_to_redeem } = body;

    if (!customer_id || !points_to_redeem) {
      return NextResponse.json(
        { error: 'customer_id and points_to_redeem are required' },
        { status: 400 }
      );
    }

    if (points_to_redeem < LOYALTY.REDEEM_MINIMUM) {
      return NextResponse.json(
        { error: `Minimum ${LOYALTY.REDEEM_MINIMUM} points required to redeem` },
        { status: 400 }
      );
    }

    // Fetch customer balance
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('loyalty_points_balance')
      .eq('id', customer_id)
      .single();

    if (custError || !customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    if (customer.loyalty_points_balance < points_to_redeem) {
      return NextResponse.json(
        { error: 'Insufficient points balance' },
        { status: 400 }
      );
    }

    // Calculate discount: $0.05 per point
    const discount = Math.round(points_to_redeem * LOYALTY.REDEEM_RATE * 100) / 100;

    return NextResponse.json({
      data: {
        points_to_redeem,
        discount,
        remaining_balance: customer.loyalty_points_balance - points_to_redeem,
      },
    });
  } catch (err) {
    console.error('Loyalty redeem error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
