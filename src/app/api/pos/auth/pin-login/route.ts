import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPosToken } from '@/lib/pos/session';

// Simple in-memory rate limit (per IP, resets on deploy)
const failureMap = new Map<string, { count: number; firstFailure: number; lockedUntil: number }>();

const MAX_FAILURES = 5;
const FAILURE_WINDOW = 5 * 60 * 1000; // 5 minutes
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const entry = failureMap.get(ip);
  if (!entry) return { allowed: true };

  const now = Date.now();

  // Check lockout
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((entry.lockedUntil - now) / 1000) };
  }

  // Reset if outside failure window
  if (now - entry.firstFailure > FAILURE_WINDOW) {
    failureMap.delete(ip);
    return { allowed: true };
  }

  return { allowed: entry.count < MAX_FAILURES };
}

function recordFailure(ip: string) {
  const now = Date.now();
  const entry = failureMap.get(ip);

  if (!entry || now - entry.firstFailure > FAILURE_WINDOW) {
    failureMap.set(ip, { count: 1, firstFailure: now, lockedUntil: 0 });
    return;
  }

  entry.count++;
  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCKOUT_DURATION;
  }
}

function clearFailures(ip: string) {
  failureMap.delete(ip);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // Rate limit check
  const rateLimitResult = checkRateLimit(ip);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many failed attempts. Please try again later.' },
      {
        status: 429,
        headers: rateLimitResult.retryAfter
          ? { 'Retry-After': String(rateLimitResult.retryAfter) }
          : undefined,
      }
    );
  }

  let body: { pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { pin } = body;

  // Validate PIN format
  if (!pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Find active employee with this PIN (include role)
  const { data: employee, error: empError } = await admin
    .from('employees')
    .select('id, auth_user_id, first_name, last_name, email, role, bookable_for_appointments')
    .eq('pin_code', pin)
    .eq('status', 'active')
    .single();

  if (empError || !employee) {
    recordFailure(ip);
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  }

  if (!employee.auth_user_id) {
    recordFailure(ip);
    return NextResponse.json(
      { error: 'This employee does not have a login account' },
      { status: 401 }
    );
  }

  // Create POS session token (no Supabase auth session needed)
  const token = createPosToken({
    id: employee.id,
    auth_user_id: employee.auth_user_id,
    role: employee.role,
    first_name: employee.first_name,
    last_name: employee.last_name,
    email: employee.email,
  });

  // Fetch idle timeout setting
  const { data: timeoutSetting } = await admin
    .from('business_settings')
    .select('value')
    .eq('key', 'pos_idle_timeout_minutes')
    .single();

  const idleTimeoutMinutes =
    timeoutSetting?.value && typeof timeoutSetting.value === 'number' && timeoutSetting.value > 0
      ? timeoutSetting.value
      : 15;

  clearFailures(ip);

  return NextResponse.json({
    token,
    employee: {
      id: employee.id,
      auth_user_id: employee.auth_user_id,
      first_name: employee.first_name,
      last_name: employee.last_name,
      email: employee.email,
      role: employee.role,
      bookable_for_appointments: employee.bookable_for_appointments,
    },
    idle_timeout_minutes: idleTimeoutMinutes,
  });
}
