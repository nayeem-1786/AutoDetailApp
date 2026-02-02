import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface LoyaltyEntry {
  customer_reference_id: string;
  points: number;
  eligible_spend: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { loyaltyEntries } = body as { loyaltyEntries: LoyaltyEntry[] };

    if (!loyaltyEntries || !Array.isArray(loyaltyEntries)) {
      return NextResponse.json(
        { error: 'Invalid request: loyaltyEntries array required' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Resolve customer reference IDs to DB IDs
    const custRefIds = [...new Set(loyaltyEntries.map((e) => e.customer_reference_id))];
    const customerMap = new Map<string, string>();

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

    let customersUpdated = 0;
    let totalPoints = 0;
    let ledgerEntriesCreated = 0;
    const errors: string[] = [];

    for (const entry of loyaltyEntries) {
      const customerId = customerMap.get(entry.customer_reference_id);

      if (!customerId) {
        continue; // Customer not imported, skip
      }

      try {
        // Update customer loyalty_points_balance
        const { error: updateError } = await adminClient
          .from('customers')
          .update({ loyalty_points_balance: entry.points })
          .eq('id', customerId);

        if (updateError) {
          errors.push(
            `Update balance for ${entry.customer_reference_id}: ${updateError.message}`
          );
          continue;
        }

        // Create loyalty_ledger entry
        const { error: ledgerError } = await adminClient
          .from('loyalty_ledger')
          .insert({
            customer_id: customerId,
            action: 'welcome_bonus',
            points_change: entry.points,
            points_balance: entry.points,
            description: `Migration welcome bonus: ${entry.points} points from $${entry.eligible_spend.toFixed(2)} eligible spend (water purchases excluded)`,
          });

        if (ledgerError) {
          errors.push(
            `Ledger for ${entry.customer_reference_id}: ${ledgerError.message}`
          );
        } else {
          ledgerEntriesCreated++;
        }

        customersUpdated++;
        totalPoints += entry.points;
      } catch (entryErr) {
        errors.push(
          `Entry ${entry.customer_reference_id}: ${entryErr instanceof Error ? entryErr.message : 'Unknown error'}`
        );
      }
    }

    return NextResponse.json({
      customersUpdated,
      totalPoints,
      ledgerEntriesCreated,
      customersResolved: customerMap.size,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (err) {
    console.error('Loyalty migration route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
