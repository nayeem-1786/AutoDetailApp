import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { convertQuote } from '@/lib/quotes/convert-service';
import { convertSchema } from '@/lib/utils/validation';
import { logAudit, getRequestIp } from '@/lib/services/audit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = convertSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const result = await convertQuote(supabase, id, parsed.data);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, ...(result.details ? { details: result.details } : {}) },
        { status: result.status }
      );
    }

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'update',
      entityType: 'quote',
      entityId: id,
      entityLabel: `Quote #${id.slice(0, 8)} converted`,
      details: { converted_to: 'job' },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('POS Quote convert error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
