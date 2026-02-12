import { NextResponse } from 'next/server';
import { checkPermission, checkAnyPermission } from './check-permission';

/**
 * Use in API routes to enforce a permission.
 * Returns null if granted, or a 403 NextResponse if denied.
 *
 * Usage:
 *   const denied = await requirePermission(employeeId, 'customers.delete');
 *   if (denied) return denied;
 */
export async function requirePermission(
  employeeId: string,
  permissionKey: string
): Promise<NextResponse | null> {
  const result = await checkPermission(employeeId, permissionKey);
  if (!result.granted) {
    return NextResponse.json(
      { error: 'Forbidden', message: `Missing permission: ${permissionKey}` },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Require ANY of the given permissions (OR logic).
 */
export async function requireAnyPermission(
  employeeId: string,
  permissionKeys: string[]
): Promise<NextResponse | null> {
  const granted = await checkAnyPermission(employeeId, permissionKeys);
  if (!granted) {
    return NextResponse.json(
      { error: 'Forbidden', message: `Missing permissions: ${permissionKeys.join(', ')}` },
      { status: 403 }
    );
  }
  return null;
}
