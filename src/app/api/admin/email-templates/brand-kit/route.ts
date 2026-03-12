import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { revalidateTag } from 'next/cache';

const BRAND_KIT_KEYS = [
  'email_brand_primary_color',
  'email_brand_accent_color',
  'email_brand_text_color',
  'email_brand_bg_color',
  'email_brand_font_family',
  'email_brand_logo_url',
  'email_brand_logo_width',
  'email_brand_social_google',
  'email_brand_social_yelp',
  'email_brand_social_instagram',
  'email_brand_social_facebook',
  'email_brand_footer_text',
];

// GET /api/admin/email-templates/brand-kit — Get all Brand Kit settings
export async function GET() {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('business_settings')
      .select('key, value')
      .in('key', BRAND_KIT_KEYS);

    if (error) throw error;

    // Build key-value object
    const settings: Record<string, unknown> = {};
    for (const row of data ?? []) {
      // Strip email_brand_ prefix for cleaner API response
      const shortKey = row.key.replace('email_brand_', '');
      settings[shortKey] = row.value;
    }

    // Also include logo_url from receipt_config as fallback reference
    const { data: receiptRow } = await admin
      .from('business_settings')
      .select('value')
      .eq('key', 'receipt_config')
      .single();

    const receiptLogoUrl = receiptRow?.value &&
      typeof receiptRow.value === 'object' &&
      (receiptRow.value as Record<string, unknown>).logo_url
        ? (receiptRow.value as Record<string, unknown>).logo_url
        : null;

    return NextResponse.json({
      data: settings,
      receipt_logo_url: receiptLogoUrl,
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    console.error('[admin/email-templates/brand-kit] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/email-templates/brand-kit — Update Brand Kit settings
export async function PATCH(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const admin = createAdminClient();

    // Validate and upsert each provided key
    const updates: Array<{ key: string; value: unknown }> = [];

    for (const [shortKey, value] of Object.entries(body)) {
      const fullKey = `email_brand_${shortKey}`;
      if (!BRAND_KIT_KEYS.includes(fullKey)) continue;
      updates.push({ key: fullKey, value });
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid Brand Kit fields provided' }, { status: 400 });
    }

    // Upsert each setting
    for (const { key, value } of updates) {
      const { error } = await admin
        .from('business_settings')
        .update({ value, updated_by: employee.auth_user_id })
        .eq('key', key);

      if (error) throw error;
    }

    // Revalidate cached business info (in case logo_url changed)
    revalidateTag('business-info');

    return NextResponse.json({ success: true, updated: updates.length });
  } catch (err) {
    console.error('[admin/email-templates/brand-kit] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
