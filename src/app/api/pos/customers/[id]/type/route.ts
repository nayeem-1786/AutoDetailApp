import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

const CUSTOMER_TYPES = ['enthusiast', 'professional'] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { customer_type } = body as { customer_type: string | null };

    // Validate type
    if (customer_type !== null && !CUSTOMER_TYPES.includes(customer_type as typeof CUSTOMER_TYPES[number])) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${CUSTOMER_TYPES.join(', ')}, or null to clear.` },
        { status: 400 }
      );
    }

    // Accept POS token auth OR admin Supabase session auth
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    const supabase = createAdminClient();

    // Update customer_type column directly
    const { data: updated, error: updateError } = await supabase
      .from('customers')
      .update({ customer_type })
      .eq('id', id)
      .select('id, customer_type')
      .single();

    if (updateError) {
      console.error('Customer type update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update customer type' },
        { status: 500 }
      );
    }

    if (!updated) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('Customer type route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
