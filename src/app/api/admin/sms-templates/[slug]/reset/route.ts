import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { invalidateSmsTemplateCache } from '@/lib/sms/render-sms-template';

export async function POST(
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

  // Fetch template to get default_body
  const { data: template, error: fetchErr } = await admin
    .from('sms_templates')
    .select('default_body')
    .eq('slug', slug)
    .single();

  if (fetchErr || !template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const { data: updated, error: updateErr } = await admin
    .from('sms_templates')
    .update({
      body_template: template.default_body,
      updated_at: new Date().toISOString(),
      updated_by: employee.auth_user_id,
    })
    .eq('slug', slug)
    .select('*')
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  invalidateSmsTemplateCache();

  return NextResponse.json(updated);
}
