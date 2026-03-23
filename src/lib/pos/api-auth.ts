import { NextRequest } from 'next/server';
import { verifyPosToken } from './session';
import { isIpAllowed } from '@/lib/security/ip-whitelist';

export interface PosEmployee {
  employee_id: string;
  auth_user_id: string;
  role: string;
  first_name: string;
  last_name: string;
  email: string;
}

/**
 * Authenticate a POS API request by verifying the X-POS-Session header token.
 * Also enforces IP whitelist (same rules as middleware for /pos/* pages).
 * Returns the employee info from the token payload, or null if invalid/expired/blocked IP.
 */
export async function authenticatePosRequest(request: NextRequest): Promise<PosEmployee | null> {
  const token = request.headers.get('X-POS-Session');
  if (!token) return null;

  const payload = verifyPosToken(token);
  if (!payload) return null;

  // Enforce IP whitelist on API routes (middleware only covers /pos/* pages)
  const allowed = await isIpAllowed(request.headers);
  if (!allowed) return null;

  return {
    employee_id: payload.employee_id,
    auth_user_id: payload.auth_user_id,
    role: payload.role,
    first_name: payload.first_name,
    last_name: payload.last_name,
    email: payload.email,
  };
}
