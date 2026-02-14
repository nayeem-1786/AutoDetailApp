import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

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

export async function GET() {
  const employee = await getEmployeeFromSession();
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

  let content = DEFAULT_AI_TXT;
  if (data?.value && typeof data.value === 'string') {
    content = data.value;
  }

  return NextResponse.json({ data: { content, default_content: DEFAULT_AI_TXT } });
}

export async function PATCH(request: Request) {
  const employee = await getEmployeeFromSession();
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

  const admin = createAdminClient();
  const { error } = await admin
    .from('business_settings')
    .upsert(
      { key: 'ai_txt_content', value: JSON.stringify(content) },
      { onConflict: 'key' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { content } });
}
