import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const CUSTOMER_TYPES = ['enthusiast', 'detailer'] as const;

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

    const supabase = await createClient();

    // Verify authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch current tags
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('tags')
      .eq('id', id)
      .single();

    if (fetchError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Remove any existing customer type tags, then add the new one
    const currentTags: string[] = Array.isArray(customer.tags) ? customer.tags : [];
    const filteredTags = currentTags.filter(
      (t: string) => !CUSTOMER_TYPES.includes(t as typeof CUSTOMER_TYPES[number])
    );

    const newTags = customer_type ? [...filteredTags, customer_type] : filteredTags;

    const { data: updated, error: updateError } = await supabase
      .from('customers')
      .update({ tags: newTags })
      .eq('id', id)
      .select('id, tags')
      .single();

    if (updateError) {
      console.error('Customer type update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update customer type' },
        { status: 500 }
      );
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
