import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { invalidateSmsTemplateCache } from '@/lib/sms/render-sms-template';

// ---------------------------------------------------------------------------
// GET  /api/admin/sms-templates/[slug] — Get single template
// PUT  /api/admin/sms-templates/[slug] — Update template
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const denied = await requirePermission(employee.id, 'settings.feature_toggles');
  if (denied) return denied;

  const { slug } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('sms_templates')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const deniedPut = await requirePermission(employee.id, 'settings.feature_toggles');
  if (deniedPut) return deniedPut;

  const { slug } = await params;
  const body = await request.json();
  const admin = createAdminClient();

  // Fetch current template
  const { data: template, error: fetchErr } = await admin
    .from('sms_templates')
    .select('*')
    .eq('slug', slug)
    .single();

  if (fetchErr || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: employee.auth_user_id,
  };

  // Validate body_template — required variables must be present
  if (body.body_template !== undefined) {
    const variables = (template.variables as Array<{ key: string; required: boolean }>) ?? [];
    const missing = variables
      .filter((v) => v.required && !body.body_template.includes(`{${v.key}}`))
      .map((v) => v.key);

    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'Missing required variables', missing },
        { status: 400 }
      );
    }

    updates.body_template = body.body_template;
  }

  // Validate is_active toggle — can_silence check
  if (body.is_active !== undefined) {
    if (body.is_active === false && !template.can_silence && !body.confirm_silence) {
      return NextResponse.json(
        { error: 'This template requires confirmation to disable. Customers will not receive this message.' },
        { status: 400 }
      );
    }
    updates.is_active = body.is_active;
  }

  // Validate recipient_phones — E.164 format
  if (body.recipient_phones !== undefined) {
    const phones = body.recipient_phones as string[];
    const e164Regex = /^\+[1-9]\d{9,14}$/;
    const invalid = phones.filter((p) => !e164Regex.test(p));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: 'Invalid phone number format', invalid },
        { status: 400 }
      );
    }
    updates.recipient_phones = phones;
  }

  const { data: updated, error: updateErr } = await admin
    .from('sms_templates')
    .update(updates)
    .eq('slug', slug)
    .select('*')
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  invalidateSmsTemplateCache();

  return NextResponse.json(updated);
}
