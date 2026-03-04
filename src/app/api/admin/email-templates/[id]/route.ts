import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/email-templates/[id] — Get single template
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('email_templates')
      .select('*, email_layouts(id, name, slug, color_overrides, header_config, footer_config)')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[admin/email-templates/[id]] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/email-templates/[id] — Update template
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const admin = createAdminClient();

    // Fetch existing template to check system status
    const { data: existing, error: fetchErr } = await admin
      .from('email_templates')
      .select('id, is_system, version')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Build update object — only include provided fields
    const update: Record<string, unknown> = {};
    const allowedFields = [
      'name', 'subject', 'preview_text', 'layout_id',
      'body_blocks', 'body_html', 'variables', 'segment_tag',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        update[field] = body[field];
      }
    }

    // Non-system templates can also update category and template_key
    if (!existing.is_system) {
      if (body.category !== undefined) update.category = body.category;
      if (body.template_key !== undefined) update.template_key = body.template_key;
    }

    // Mark as customized and bump version
    if (existing.is_system) {
      update.is_customized = true;
    }
    update.version = existing.version + 1;
    update.updated_by = employee.auth_user_id;

    const { data, error } = await admin
      .from('email_templates')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[admin/email-templates/[id]] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/email-templates/[id] — Delete template (non-system only)
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const admin = createAdminClient();

    // Check if system template
    const { data: existing } = await admin
      .from('email_templates')
      .select('id, is_system, name')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (existing.is_system) {
      return NextResponse.json({ error: 'System templates cannot be deleted' }, { status: 400 });
    }

    const { error } = await admin
      .from('email_templates')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/email-templates/[id]] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
