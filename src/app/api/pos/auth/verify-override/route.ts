import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';

/**
 * POST /api/pos/auth/verify-override
 *
 * Verify a manager's PIN and check if they have a specific permission.
 * Used by the generic ManagerPinDialog for override flows (prerequisites, discounts, etc.).
 *
 * Body: { pin: string, permission_key: string }
 * Returns: { employee_name: string } on success
 */
export async function POST(request: NextRequest) {
  // Require an active POS session (the requesting employee)
  const posEmployee = authenticatePosRequest(request);
  if (!posEmployee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { pin?: string; permission_key?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { pin, permission_key } = body;

  if (!pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
  }

  if (!permission_key || typeof permission_key !== 'string') {
    return NextResponse.json({ error: 'Permission key is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Find active employee with this PIN
  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('id, first_name, last_name, role')
    .eq('pin_code', pin)
    .eq('status', 'active')
    .single();

  if (empError || !employee) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  }

  // Check if this employee has the required permission
  const hasPermission = await checkPosPermission(
    supabase,
    employee.role,
    employee.id,
    permission_key
  );

  if (!hasPermission) {
    return NextResponse.json(
      { error: `${employee.first_name} does not have override permission` },
      { status: 403 }
    );
  }

  return NextResponse.json({
    employee_name: `${employee.first_name} ${employee.last_name}`,
  });
}
