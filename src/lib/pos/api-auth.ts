import { NextRequest } from 'next/server';
import { verifyPosToken, type PosTokenPayload } from './session';

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
 * Returns the employee info from the token payload, or null if invalid/expired.
 */
export function authenticatePosRequest(request: NextRequest): PosEmployee | null {
  const token = request.headers.get('X-POS-Session');
  if (!token) return null;

  const payload = verifyPosToken(token);
  if (!payload) return null;

  return {
    employee_id: payload.employee_id,
    auth_user_id: payload.auth_user_id,
    role: payload.role,
    first_name: payload.first_name,
    last_name: payload.last_name,
    email: payload.email,
  };
}
