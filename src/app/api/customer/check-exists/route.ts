import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';

// In-memory rate limiter: max 10 lookups per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// GET ?phone=XXXX or ?email=XXXX
// Public endpoint — no auth required
// Returns { exists, hasAuthAccount } only — no PII
export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { exists: false, hasAuthAccount: false },
        { status: 429 }
      );
    }

    const { searchParams } = request.nextUrl;
    const phone = searchParams.get('phone');
    const email = searchParams.get('email');

    if (!phone && !email) {
      return NextResponse.json(
        { exists: false, hasAuthAccount: false },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check by phone
    if (phone) {
      const e164 = normalizePhone(phone);
      if (!e164) {
        return NextResponse.json({ exists: false, hasAuthAccount: false });
      }

      const { data: customer } = await supabase
        .from('customers')
        .select('id, auth_user_id')
        .eq('phone', e164)
        .maybeSingle();

      if (!customer) {
        return NextResponse.json({ exists: false, hasAuthAccount: false });
      }

      return NextResponse.json({
        exists: true,
        hasAuthAccount: !!customer.auth_user_id,
      });
    }

    // Check by email
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();

      const { data: customer } = await supabase
        .from('customers')
        .select('id, auth_user_id')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (!customer) {
        return NextResponse.json({ exists: false, hasAuthAccount: false });
      }

      return NextResponse.json({
        exists: true,
        hasAuthAccount: !!customer.auth_user_id,
      });
    }

    return NextResponse.json({ exists: false, hasAuthAccount: false });
  } catch {
    // Fail silently — don't reveal internal errors
    return NextResponse.json({ exists: false, hasAuthAccount: false });
  }
}
