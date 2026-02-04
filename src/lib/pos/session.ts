import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_LIFETIME_HOURS = 12;

export interface PosTokenPayload {
  employee_id: string;
  auth_user_id: string;
  role: string;
  first_name: string;
  last_name: string;
  email: string;
  iat: number;
  exp: number;
}

function getSecret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return key;
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function sign(payload: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(payload).digest('base64');
  return sig.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createPosToken(employee: {
  id: string;
  auth_user_id: string;
  role: string;
  first_name: string;
  last_name: string;
  email: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: PosTokenPayload = {
    employee_id: employee.id,
    auth_user_id: employee.auth_user_id,
    role: employee.role,
    first_name: employee.first_name,
    last_name: employee.last_name,
    email: employee.email,
    iat: now,
    exp: now + TOKEN_LIFETIME_HOURS * 3600,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, getSecret());
  return `${encodedPayload}.${signature}`;
}

export function verifyPosToken(token: string): PosTokenPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSig] = parts;

  try {
    const expectedSig = sign(encodedPayload, getSecret());

    // Timing-safe comparison
    const sigBuf = Buffer.from(providedSig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload: PosTokenPayload = JSON.parse(base64UrlDecode(encodedPayload));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}
