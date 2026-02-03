import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

  // Find active employee with this PIN
  const { data: employee, error: empError } = await admin
    .from('employees')
    .select('id, auth_user_id, first_name, last_name, email')
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

  // Get the user's email from auth
  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(
    employee.auth_user_id
  );

  if (authError || !authUser?.user?.email) {
    recordFailure(ip);
    return NextResponse.json({ error: 'Unable to authenticate employee' }, { status: 500 });
  }

  const email = authUser.user.email;

  // Generate a magic link token
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('PIN login generateLink error:', linkError);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }

  // Extract the hashed token — client will pass this to verifyOtp as token_hash
  const token_hash = linkData.properties.hashed_token;

  clearFailures(ip);

  return NextResponse.json({
    token_hash,
  });
}
