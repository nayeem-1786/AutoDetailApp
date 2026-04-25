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

  // Validate body_template — required variables must be present + placeholder syntax must be well-formed
  if (body.body_template !== undefined) {
    const newBody: string = body.body_template;

    // Normalize the variable registry the same way render-sms-template.ts does:
    // production stores a flat string[] of keys, legacy migrations store object form.
    // Treat every listed variable as required (per Session 42X-1 schema clarification).
    const rawVars: unknown = template.variables;
    const allowedKeys: string[] = Array.isArray(rawVars)
      ? rawVars
          .map((entry) => {
            if (typeof entry === 'string') return entry;
            if (entry && typeof entry === 'object' && 'key' in entry) {
              return (entry as { key: string }).key;
            }
            return null;
          })
          .filter((k): k is string => typeof k === 'string')
      : [];

    // 1. Reject doubled-brace patterns ({{key}} — common operator typo)
    //    Match doubled-brace tokens before the single-brace scan strips them.
    const doubledBraceMatch = newBody.match(/\{\{[^}]+\}\}/);
    if (doubledBraceMatch) {
      return NextResponse.json(
        {
          error: `Doubled braces are not supported. Found "${doubledBraceMatch[0]}". Use single braces: ${doubledBraceMatch[0].replace(/^\{\{/, '{').replace(/\}\}$/, '}')}`,
        },
        { status: 400 }
      );
    }

    // 2. Scan {…} placeholders for valid syntax + known keys.
    //    The render engine substitutes /\{(\w+)\}/g and the post-render scan uses
    //    /\{([a-z_]+)\}/g — placeholders outside the lowercase-letters-and-underscore
    //    pattern would never substitute and would leak as raw text. Reject them here.
    const placeholderRegex = /\{([^}]*)\}/g;
    const validKeyPattern = /^[a-z][a-z0-9_]*$/;
    let match: RegExpExecArray | null;
    const offendersUnknown: string[] = [];
    const offendersMalformed: string[] = [];
    while ((match = placeholderRegex.exec(newBody)) !== null) {
      const inner = match[1];
      if (!validKeyPattern.test(inner)) {
        offendersMalformed.push(match[0]);
        continue;
      }
      if (!allowedKeys.includes(inner)) {
        offendersUnknown.push(match[0]);
      }
    }
    if (offendersMalformed.length > 0) {
      return NextResponse.json(
        {
          error: `Malformed placeholder: ${offendersMalformed.join(', ')}. Use lowercase letters, digits, and underscores only; must start with a letter.`,
          malformed: offendersMalformed,
        },
        { status: 400 }
      );
    }
    if (offendersUnknown.length > 0) {
      return NextResponse.json(
        {
          error: `Unknown placeholder: ${offendersUnknown.join(', ')}. Valid variables for this template: ${allowedKeys.length > 0 ? allowedKeys.map((k) => `{${k}}`).join(', ') : '(none)'}.`,
          unknown: offendersUnknown,
        },
        { status: 400 }
      );
    }

    // 3. Required-variables-present check (existing behavior preserved).
    //    Schema clarification: every listed variable is treated as required.
    const missing = allowedKeys.filter((key) => !newBody.includes(`{${key}}`));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'Missing required variables', missing },
        { status: 400 }
      );
    }

    updates.body_template = newBody;
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
