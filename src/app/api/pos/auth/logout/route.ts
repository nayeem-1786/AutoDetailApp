import { NextRequest, NextResponse } from 'next/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { logAudit, getRequestIp } from '@/lib/services/audit';

export async function POST(request: NextRequest) {
  const posEmployee = authenticatePosRequest(request);

  // Even if token is expired/invalid, still try to log what we can
  const body = await request.json().catch(() => ({}));
  const reason = (body as Record<string, unknown>).reason as string | undefined;

  logAudit({
    userId: posEmployee?.auth_user_id ?? null,
    userEmail: posEmployee?.email ?? null,
    employeeName: posEmployee
      ? `${posEmployee.first_name} ${posEmployee.last_name}`
      : null,
    action: 'logout',
    entityType: 'employee',
    entityId: posEmployee?.employee_id ?? null,
    entityLabel: posEmployee
      ? `${posEmployee.first_name} ${posEmployee.last_name}`
      : 'Unknown (expired token)',
    details: reason ? { reason } : null,
    ipAddress: getRequestIp(request),
    source: 'pos',
  });

  return NextResponse.json({ success: true });
}
