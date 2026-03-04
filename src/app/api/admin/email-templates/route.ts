import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// GET /api/admin/email-templates — List templates with optional filters
export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    const admin = createAdminClient();
    let query = admin
      .from('email_templates')
      .select('*, email_layouts(id, name, slug)', { count: 'exact' })
      .order('category')
      .order('name');

    if (category) query = query.eq('category', category);
    if (search) query = query.ilike('name', `%${search}%`);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ data, total: count ?? 0, page, limit }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    console.error('[admin/email-templates] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/email-templates — Create a new template
export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { name, category, subject, preview_text, layout_id, body_blocks, variables, segment_tag } = body;

    if (!name || !category || !subject || !layout_id) {
      return NextResponse.json({ error: 'Missing required fields: name, category, subject, layout_id' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('email_templates')
      .insert({
        name,
        category,
        subject,
        preview_text: preview_text || '',
        layout_id,
        body_blocks: body_blocks || [],
        variables: variables || [],
        segment_tag: segment_tag || null,
        is_system: false,
        is_customized: false,
        updated_by: employee.auth_user_id,
      })
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('[admin/email-templates] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
