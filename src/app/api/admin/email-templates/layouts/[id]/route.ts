import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/email-templates/layouts/[id] — Get single layout
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('email_layouts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Layout not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[admin/email-templates/layouts/[id]] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/email-templates/layouts/[id] — Update layout settings
// Note: Layouts cannot be deleted (system layouts). Only colors and configs are editable.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const admin = createAdminClient();

    // Build update — only allow safe fields
    const update: Record<string, unknown> = {};
    if (body.color_overrides !== undefined) update.color_overrides = body.color_overrides;
    if (body.header_config !== undefined) update.header_config = body.header_config;
    if (body.footer_config !== undefined) update.footer_config = body.footer_config;
    if (body.description !== undefined) update.description = body.description;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('email_layouts')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Layout not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[admin/email-templates/layouts/[id]] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
