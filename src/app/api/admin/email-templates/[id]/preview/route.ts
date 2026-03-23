import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { fetchBrandKit, renderEmail } from '@/lib/email/layout-renderer';
import { getSampleVariables } from '@/lib/email/variables';
import { getBusinessInfo } from '@/lib/data/business';
import type { EmailBlock, EmailLayout } from '@/lib/email/types';

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/email-templates/[id]/preview — Render preview HTML
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const admin = createAdminClient();

    // Allow passing blocks directly (for unsaved edits) or use saved template
    let blocks: EmailBlock[];
    let layoutId: string;
    let subject: string;

    if (body.body_blocks && body.layout_id) {
      // Preview from editor (unsaved)
      blocks = body.body_blocks;
      layoutId = body.layout_id;
      subject = body.subject || 'Preview';
    } else {
      // Preview saved template
      const { data: template, error } = await admin
        .from('email_templates')
        .select('body_blocks, layout_id, subject')
        .eq('id', id)
        .single();

      if (error || !template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      blocks = template.body_blocks as EmailBlock[];
      layoutId = template.layout_id;
      subject = template.subject;
    }

    // Fetch layout
    const { data: layout, error: layoutErr } = await admin
      .from('email_layouts')
      .select('*')
      .eq('id', layoutId)
      .single();

    if (layoutErr || !layout) {
      return NextResponse.json({ error: 'Layout not found' }, { status: 404 });
    }

    // Render with sample variables + real business data from DB
    const brandKit = await fetchBrandKit();
    const biz = await getBusinessInfo();
    const sampleVars = getSampleVariables();
    const variables = {
      ...sampleVars,
      business_name: biz.name,
      business_phone: biz.phone,
      business_email: biz.email || '',
      business_address: biz.address,
      business_website: biz.website || '',
      _subject: subject,
      ...body.variables,
    };

    const rendered = await renderEmail(
      blocks,
      layout as unknown as EmailLayout,
      brandKit,
      variables,
      { isMarketing: body.isMarketing ?? false }
    );

    return NextResponse.json({
      html: rendered.html,
      text: rendered.text,
      subject: rendered.subject,
    });
  } catch (err) {
    console.error('[admin/email-templates/[id]/preview] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
