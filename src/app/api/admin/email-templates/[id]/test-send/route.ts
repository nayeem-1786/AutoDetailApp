import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { fetchBrandKit, renderEmail } from '@/lib/email/layout-renderer';
import { getSampleVariables } from '@/lib/email/variables';
import { sendEmail } from '@/lib/utils/email';
import type { EmailBlock, EmailLayout } from '@/lib/email/types';

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/email-templates/[id]/test-send — Send test email
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { to } = body;

    if (!to || typeof to !== 'string' || !to.includes('@')) {
      return NextResponse.json({ error: 'Valid email address required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch template
    const { data: template, error } = await admin
      .from('email_templates')
      .select('body_blocks, layout_id, subject, preview_text')
      .eq('id', id)
      .single();

    if (error || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Fetch layout
    const { data: layout, error: layoutErr } = await admin
      .from('email_layouts')
      .select('*')
      .eq('id', template.layout_id)
      .single();

    if (layoutErr || !layout) {
      return NextResponse.json({ error: 'Layout not found' }, { status: 404 });
    }

    // Render with sample variables
    const brandKit = await fetchBrandKit();
    const sampleVars = getSampleVariables();
    const variables = { ...sampleVars, _subject: template.subject };

    const rendered = await renderEmail(
      template.body_blocks as EmailBlock[],
      layout as unknown as EmailLayout,
      brandKit,
      variables,
      { isMarketing: false }
    );

    // Send via Mailgun
    const result = await sendEmail(
      to,
      `[TEST] ${rendered.subject}`,
      rendered.text,
      rendered.html
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send test email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageId: result.id });
  } catch (err) {
    console.error('[admin/email-templates/[id]/test-send] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
