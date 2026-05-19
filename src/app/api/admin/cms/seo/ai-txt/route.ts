import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { revalidateTag } from '@/lib/utils/revalidate';
import type { Json } from '@/lib/supabase/database.types';

// ---------------------------------------------------------------------------
// GET   /api/admin/cms/seo/ai-txt — Read ai_txt_content from business_settings
// PATCH /api/admin/cms/seo/ai-txt — Update ai_txt_content in business_settings
// ---------------------------------------------------------------------------

const DEFAULT_AI_TXT = `# ai.txt - AI Crawler Access Rules
# This file controls AI crawler access

User-agent: GPTBot
Allow: /
Allow: /services/
Allow: /products/
Allow: /areas/
Disallow: /admin/
Disallow: /api/
Disallow: /pos/
Disallow: /account/
Disallow: /login

User-agent: Google-Extended
Allow: /
Disallow: /admin/
Disallow: /api/

User-agent: CCBot
Allow: /
Disallow: /admin/
Disallow: /api/

User-agent: anthropic-ai
Allow: /
Disallow: /admin/
Disallow: /api/
`;

export async function GET(request: NextRequest) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('business_settings')
    .select('value')
    .eq('key', 'ai_txt_content')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transition shim for legacy double-encoded rows written by the pre-fix
  // PATCH handler (see migration 2026XXXX_normalize_ai_txt_content_double_encoding.sql).
  // Supabase auto-deserializes JSONB; for a row already stored cleanly,
  // JSON.parse on a non-JSON-shaped string throws and the catch returns the
  // raw value. Post-migration this shim is dead code but is kept as belt-and-
  // suspenders against any future row that drifts back into the double-
  // encoded shape.
  let content = DEFAULT_AI_TXT;
  if (data?.value !== undefined && data.value !== null) {
    const raw = data.value;
    if (typeof raw === 'string') {
      // Detect the legacy double-encoded form: a JS string that itself parses
      // as a valid JSON string. JSON.parse('"abc"') === 'abc'; JSON.parse on
      // a multi-line ai.txt body (which is not valid JSON) throws.
      if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
        try {
          const unwrapped = JSON.parse(raw);
          if (typeof unwrapped === 'string') {
            content = unwrapped;
          } else {
            content = raw;
          }
        } catch {
          content = raw;
        }
      } else {
        content = raw;
      }
    }
  }

  return NextResponse.json({ data: { content, default_content: DEFAULT_AI_TXT } });
}

export async function PATCH(request: NextRequest) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const body = await request.json();
  const { content } = body as { content: string };

  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content is required and must be a string' }, { status: 400 });
  }

  // Value is passed RAW to Supabase — the JS client serializes for JSONB
  // itself. Prior versions called JSON.stringify(content) here, which caused
  // immediate double-encoding on every Save: a clean ai.txt body became a
  // JSONB string whose deserialized form had literal `"` characters at both
  // ends and `\n` escape sequences mid-string, served as text/plain to AI
  // crawlers at /ai.txt. Audit: docs/dev/AUDIT_ADMIN_PUT_JSONB_2026-05-19.md.
  // Same anti-pattern fix as homepage-settings (commit 3da3183e).
  const admin = createAdminClient();
  const { error } = await admin
    .from('business_settings')
    .upsert(
      { key: 'ai_txt_content', value: content as Json },
      { onConflict: 'key' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('cms-seo');
  return NextResponse.json({ data: { content } });
}
