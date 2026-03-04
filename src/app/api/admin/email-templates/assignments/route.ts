import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// GET /api/admin/email-templates/assignments — List segment routing assignments
export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const triggerKey = searchParams.get('trigger_key');

    const admin = createAdminClient();
    let query = admin
      .from('email_template_assignments')
      .select('*, email_templates(id, name, template_key, category, segment_tag)')
      .order('trigger_key')
      .order('priority', { ascending: false });

    if (triggerKey) query = query.eq('trigger_key', triggerKey);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    console.error('[admin/email-templates/assignments] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/email-templates/assignments — Create or update an assignment
export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { trigger_key, template_id, segment_filter, priority, is_active } = body;

    if (!trigger_key || !template_id) {
      return NextResponse.json({ error: 'Missing required fields: trigger_key, template_id' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('email_template_assignments')
      .insert({
        trigger_key,
        template_id,
        segment_filter: segment_filter || null,
        priority: priority ?? 0,
        is_active: is_active ?? true,
      })
      .select('*, email_templates(id, name, template_key, category, segment_tag)')
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('[admin/email-templates/assignments] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/email-templates/assignments — Update an assignment by id
export async function PATCH(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing assignment id' }, { status: 400 });
    }

    const admin = createAdminClient();
    const allowedFields = ['template_id', 'segment_filter', 'priority', 'is_active'];
    const update: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) update[field] = updates[field];
    }

    const { data, error } = await admin
      .from('email_template_assignments')
      .update(update)
      .eq('id', id)
      .select('*, email_templates(id, name, template_key, category, segment_tag)')
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[admin/email-templates/assignments] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/email-templates/assignments — Delete an assignment by id
export async function DELETE(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing assignment id' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from('email_template_assignments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/email-templates/assignments] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
