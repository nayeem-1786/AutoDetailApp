import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { invalidateSmsTemplateCache } from '@/lib/sms/render-sms-template';
import { SMS_PALETTE_KEYS } from '@/lib/sms/palette';

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

  // Validate body_template — placeholder syntax + palette membership + contract scope.
  if (body.body_template !== undefined) {
    const newBody: string = body.body_template;

    // Session 2E.1a: chip classification reads the new contract columns.
    // - inPalette: every chip declared in the universal palette (typo gate).
    // - inContract: chips declared on this slug's contract (required ∪ optional).
    // Chips outside inPalette are typos → hard reject.
    // Chips in inPalette but not in inContract are unsupplied → 409 warning gate.
    const requiredKeys: string[] = Array.isArray(template.required_variables)
      ? (template.required_variables as unknown[]).filter(
          (k): k is string => typeof k === 'string'
        )
      : [];
    const optionalKeys: string[] = Array.isArray(template.optional_variables)
      ? (template.optional_variables as unknown[]).filter(
          (k): k is string => typeof k === 'string'
        )
      : [];
    const inContract = new Set<string>([...requiredKeys, ...optionalKeys]);
    const inPalette = new Set<string>(SMS_PALETTE_KEYS);

    // 1. Reject doubled-brace patterns ({{key}} — common operator typo).
    const doubledBraceMatch = newBody.match(/\{\{[^}]+\}\}/);
    if (doubledBraceMatch) {
      return NextResponse.json(
        {
          error: `Doubled braces are not supported. Found "${doubledBraceMatch[0]}". Use single braces: ${doubledBraceMatch[0].replace(/^\{\{/, '{').replace(/\}\}$/, '}')}`,
        },
        { status: 400 }
      );
    }

    // 2. Scan {…} placeholders, classify into malformed / unknown / warning / OK.
    const placeholderRegex = /\{([^}]*)\}/g;
    const validKeyPattern = /^[a-z][a-z0-9_]*$/;
    const offendersMalformed: string[] = [];
    const offendersUnknown: string[] = [];
    const warningChips = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = placeholderRegex.exec(newBody)) !== null) {
      const inner = match[1];
      if (!validKeyPattern.test(inner)) {
        offendersMalformed.push(match[0]);
        continue;
      }
      if (!inPalette.has(inner)) {
        offendersUnknown.push(match[0]);
        continue;
      }
      if (!inContract.has(inner)) {
        warningChips.add(inner);
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
      const validChips = [...requiredKeys, ...optionalKeys];
      return NextResponse.json(
        {
          error: `Unknown placeholder: ${offendersUnknown.join(', ')}. These chips don't exist in the universal palette. Valid chips for this template: ${validChips.length > 0 ? validChips.map((k) => `{${k}}`).join(', ') : '(none)'}.`,
          unknown: offendersUnknown,
        },
        { status: 400 }
      );
    }

    // 3. Required-presence check — every chip in required_variables must
    //    appear as {key} in the body, else the message is incoherent.
    const missing = requiredKeys.filter((key) => !newBody.includes(`{${key}}`));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'Missing required variables', missing },
        { status: 400 }
      );
    }

    // 4. Warning gate (409) — chips in palette but not in this slug's contract.
    //    Mirrors the confirm_silence pattern at line 161 below: client receives
    //    409 with the warning list, displays a confirm dialog, then re-POSTs
    //    with confirm_warnings: true to commit.
    if (warningChips.size > 0 && !body.confirm_warnings) {
      const warningList = Array.from(warningChips);
      return NextResponse.json(
        {
          warnings: warningList,
          message: `The following chip(s) are in the universal palette but aren't supplied to this slug by callers: ${warningList.map((k) => `{${k}}`).join(', ')}. Lines containing them will be removed from rendered SMS.`,
        },
        { status: 409 }
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
