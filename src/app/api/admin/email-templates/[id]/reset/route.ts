import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/email-templates/[id]/reset — Reset system template to defaults
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const admin = createAdminClient();

    // Fetch existing template
    const { data: existing, error: fetchErr } = await admin
      .from('email_templates')
      .select('id, is_system, is_customized')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (!existing.is_system) {
      return NextResponse.json({ error: 'Only system templates can be reset' }, { status: 400 });
    }

    if (!existing.is_customized) {
      return NextResponse.json({ error: 'Template has not been customized' }, { status: 400 });
    }

    // Reset: clear customizations, mark as not customized
    // The actual default content will be re-seeded when seed data is created (Sub-phase 8).
    // For now, clearing body_blocks and body_html marks it ready for re-seed.
    const { data, error } = await admin
      .from('email_templates')
      .update({
        body_blocks: [],
        body_html: null,
        is_customized: false,
        updated_by: employee.auth_user_id,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[admin/email-templates/[id]/reset] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
