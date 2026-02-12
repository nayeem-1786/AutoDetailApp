import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

// DELETE - Delete a customer and associated records
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'customers.delete');
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();

    // Verify customer exists
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, first_name, last_name')
      .eq('id', id)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Delete associated records

    // 1. Delete vehicles
    const { error: vehiclesError } = await supabase
      .from('vehicles')
      .delete()
      .eq('customer_id', id);

    if (vehiclesError) {
      console.error('Failed to delete vehicles:', vehiclesError);
    }

    // 2. Delete loyalty ledger entries
    const { error: ledgerError } = await supabase
      .from('loyalty_ledger')
      .delete()
      .eq('customer_id', id);

    if (ledgerError) {
      console.error('Failed to delete loyalty ledger:', ledgerError);
    }

    // 3. Unlink transactions (preserve for accounting)
    const { error: txError } = await supabase
      .from('transactions')
      .update({ customer_id: null })
      .eq('customer_id', id);

    if (txError) {
      console.error('Failed to unlink transactions:', txError);
    }

    // 4. Delete marketing consent log entries
    const { error: consentError } = await supabase
      .from('marketing_consent_log')
      .delete()
      .eq('customer_id', id);

    if (consentError) {
      console.error('Failed to delete consent log:', consentError);
    }

    // 5. Delete appointments
    const { error: appointmentsError } = await supabase
      .from('appointments')
      .delete()
      .eq('customer_id', id);

    if (appointmentsError) {
      console.error('Failed to delete appointments:', appointmentsError);
    }

    // 6. Delete quotes
    const { error: quotesError } = await supabase
      .from('quotes')
      .delete()
      .eq('customer_id', id);

    if (quotesError) {
      console.error('Failed to delete quotes:', quotesError);
    }

    // Finally delete the customer
    const { error: deleteError } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Failed to delete customer:', deleteError);
      return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: `${customer.first_name} ${customer.last_name}`
    });
  } catch (err) {
    console.error('Delete customer error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
