import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/utils/email';
import { getBusinessInfo } from '@/lib/data/business';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const rawEmail = body.email;

    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const email = rawEmail.toLowerCase().trim();

    // Basic email format check
    if (!email.includes('@') || !email.includes('.')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Find customer for this auth user
    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Check email uniqueness (exclude self, exclude soft-deleted)
    const { data: existingByEmail } = await admin
      .from('customers')
      .select('id')
      .ilike('email', email)
      .neq('id', customer.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingByEmail) {
      return NextResponse.json(
        { error: 'This email is already associated with another account' },
        { status: 409 }
      );
    }

    // Rate limit: max 3 active (non-expired, non-verified) codes for this customer
    const { data: activeCodes } = await admin
      .from('email_verification_codes')
      .select('id')
      .eq('customer_id', customer.id)
      .is('verified_at', null)
      .gt('expires_at', new Date().toISOString());

    if (activeCodes && activeCodes.length >= 3) {
      return NextResponse.json(
        { error: 'Too many verification requests. Please wait and try again.' },
        { status: 429 }
      );
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Insert verification record
    const { error: insertErr } = await admin
      .from('email_verification_codes')
      .insert({
        customer_id: customer.id,
        email,
        code,
        expires_at: expiresAt,
      });

    if (insertErr) {
      console.error('Verification code insert error:', insertErr.message);
      return NextResponse.json({ error: 'Failed to create verification code' }, { status: 500 });
    }

    // Send verification email
    const businessInfo = await getBusinessInfo();
    const businessName = businessInfo.name;

    const text = `Your verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n${businessName}`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0A0A0A;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:#1A1A1A;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px;text-align:center;margin-bottom:24px;">
      <h1 style="color:#FFFFFF;font-size:20px;margin:0 0 8px;">Verify Your Email</h1>
      <p style="color:#D1D5DB;font-size:14px;margin:0 0 24px;">Enter this code on your profile page:</p>
      <div style="background:#0A0A0A;border:2px solid #CCFF00;border-radius:12px;padding:20px;margin:0 auto;max-width:240px;">
        <span style="color:#CCFF00;font-size:36px;font-weight:bold;letter-spacing:0.3em;">${code}</span>
      </div>
      <p style="color:#9CA3AF;font-size:13px;margin:20px 0 0;">This code expires in 15 minutes.</p>
    </div>
    <div style="text-align:center;padding:16px;">
      <p style="color:#6B7280;font-size:12px;margin:0;">If you didn&rsquo;t request this, you can safely ignore this email.</p>
      <p style="color:#6B7280;font-size:12px;margin:8px 0 0;">${businessName}</p>
    </div>
  </div>
</body>
</html>`;

    const result = await sendEmail(email, `Your ${businessName} verification code`, text, html);

    if (!result.success) {
      console.error('Verification email send failed:', result.error);
      return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Verification code sent' });
  } catch (err) {
    console.error('Send verification code error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
