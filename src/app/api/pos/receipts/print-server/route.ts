import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { generateReceiptLines, receiptToEscPos } from '@/app/pos/lib/receipt-template';
import { fetchReceiptData } from '@/lib/data/receipt-data';

export async function POST(request: NextRequest) {
  try {
    let employeeId: string | null = null;
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      const supabaseSession = await createClient();
      const { data: { user } } = await supabaseSession.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      employeeId = posEmployee.employee_id;
    }

    const body = await request.json();
    const { transaction_id } = body;

    if (!transaction_id) {
      return NextResponse.json(
        { error: 'transaction_id is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { tx, config, context } = await fetchReceiptData(supabase, transaction_id);

    const receiptLines = generateReceiptLines(tx, config, context);
    const escPosData = receiptToEscPos(receiptLines, 48);

    // Encode ESC/POS binary as base64 and insert into print_jobs queue.
    // The OptiPlex polling agent picks up pending jobs and sends to the local printer.
    const payload = Buffer.from(escPosData).toString('base64');

    const { data: job, error: insertError } = await supabase
      .from('print_jobs')
      .insert({
        type: 'thermal_receipt',
        payload,
        transaction_id,
        created_by: employeeId,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to create print job:', insertError);
      return NextResponse.json(
        { error: 'Failed to queue print job' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, job_id: job.id });
  } catch (err) {
    console.error('Receipt print-server error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message === 'Transaction not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
