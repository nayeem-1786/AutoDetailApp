import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface TransactionItemPayload {
  item_name: string;
  category: string | null;
  sku: string | null;
  quantity: number;
  gross_sales: number;
  net_sales: number;
  tax: number;
  discount_amount: number;
  price_point_name: string | null;
  itemization_type: string | null;
}

interface TransactionPayload {
  square_transaction_id: string;
  customer_reference_id: string | null;
  staff_name: string | null;
  transaction_date: string;
  gross_sales: number;
  net_sales: number;
  tax_amount: number;
  tip_amount: number;
  total_amount: number;
  discount_amount: number;
  payment_method: 'cash' | 'card' | null;
  card_brand: string | null;
  card_last_four: string | null;
  fees: number;
  transaction_status: string;
  items: TransactionItemPayload[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactions } = body as { transactions: TransactionPayload[] };

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'Invalid request: transactions array required' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Build customer reference ID -> DB ID map
    const custRefIds = [
      ...new Set(
        transactions
          .map((t) => t.customer_reference_id)
          .filter(Boolean) as string[]
      ),
    ];

    const customerMap = new Map<string, string>();

    if (custRefIds.length > 0) {
      // Fetch in batches of 100
      for (let i = 0; i < custRefIds.length; i += 100) {
        const batch = custRefIds.slice(i, i + 100);
        const { data: customers } = await adminClient
          .from('customers')
          .select('id, square_reference_id')
          .in('square_reference_id', batch);

        customers?.forEach((c) => {
          if (c.square_reference_id) {
            customerMap.set(c.square_reference_id, c.id);
          }
        });
      }
    }

    // Build staff name -> employee ID map
    const staffNames = [
      ...new Set(
        transactions
          .map((t) => t.staff_name)
          .filter(Boolean) as string[]
      ),
    ];

    const employeeMap = new Map<string, string>();

    if (staffNames.length > 0) {
      // Try to match by first_name + last_name
      const { data: employees } = await adminClient
        .from('employees')
        .select('id, first_name, last_name');

      employees?.forEach((e) => {
        const fullName = `${e.first_name} ${e.last_name}`.trim();
        employeeMap.set(fullName, e.id);
      });
    }

    let transactionsImported = 0;
    let itemsImported = 0;
    const errors: string[] = [];

    for (const txn of transactions) {
      try {
        const customerId = txn.customer_reference_id
          ? customerMap.get(txn.customer_reference_id) || null
          : null;

        const employeeId = txn.staff_name
          ? employeeMap.get(txn.staff_name) || null
          : null;

        // Determine status
        const status =
          txn.transaction_status === 'Complete' || txn.transaction_status === 'Completed'
            ? 'completed'
            : txn.transaction_status === 'Voided'
              ? 'voided'
              : txn.transaction_status === 'Refunded'
                ? 'refunded'
                : 'completed';

        // Insert transaction
        const { data: txnRow, error: txnError } = await adminClient
          .from('transactions')
          .insert({
            square_transaction_id: txn.square_transaction_id,
            customer_id: customerId,
            employee_id: employeeId,
            status,
            subtotal: txn.net_sales,
            tax_amount: txn.tax_amount,
            tip_amount: txn.tip_amount,
            discount_amount: txn.discount_amount,
            total_amount: txn.total_amount,
            payment_method: txn.payment_method || null,
            transaction_date: txn.transaction_date,
            loyalty_points_earned: 0,
            loyalty_points_redeemed: 0,
            loyalty_discount: 0,
          })
          .select('id')
          .single();

        if (txnError) {
          errors.push(`Transaction ${txn.square_transaction_id}: ${txnError.message}`);
          continue;
        }

        transactionsImported++;

        // Insert transaction items
        if (txnRow && txn.items.length > 0) {
          const itemRows = txn.items.map((item) => ({
            transaction_id: txnRow.id,
            item_type: 'product' as const,
            item_name: item.item_name,
            quantity: item.quantity,
            unit_price: item.net_sales / (item.quantity || 1),
            total_price: item.net_sales,
            tax_amount: item.tax,
            is_taxable: item.tax > 0,
            tier_name: item.price_point_name || null,
            notes: item.itemization_type || null,
          }));

          const { data: insertedItems, error: itemError } = await adminClient
            .from('transaction_items')
            .insert(itemRows)
            .select('id');

          if (itemError) {
            errors.push(
              `Items for ${txn.square_transaction_id}: ${itemError.message}`
            );
          } else {
            itemsImported += insertedItems?.length || itemRows.length;
          }
        }

        // Insert payment record if we have payment method
        if (txnRow && txn.payment_method) {
          await adminClient.from('payments').insert({
            transaction_id: txnRow.id,
            method: txn.payment_method,
            amount: txn.total_amount - txn.tip_amount,
            tip_amount: txn.tip_amount,
            tip_net: txn.tip_amount,
            card_brand: txn.card_brand || null,
            card_last_four: txn.card_last_four || null,
          });
        }
      } catch (txnErr) {
        errors.push(
          `Transaction ${txn.square_transaction_id}: ${txnErr instanceof Error ? txnErr.message : 'Unknown error'}`
        );
      }
    }

    return NextResponse.json({
      transactionsImported,
      itemsImported,
      customersMatched: customerMap.size,
      employeesMatched: employeeMap.size,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (err) {
    console.error('Transaction migration route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
