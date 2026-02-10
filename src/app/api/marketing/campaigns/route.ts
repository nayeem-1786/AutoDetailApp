import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { campaignCreateSchema } from '@/lib/utils/validation';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Use admin client to bypass RLS for auth check and data query
    const admin = createAdminClient();
    const { data: employee } = await admin
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') || '';
    const channel = searchParams.get('channel') || '';
    const offset = (page - 1) * limit;

    // Use admin client to bypass RLS
    let query = admin
      .from('campaigns')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (channel) query = query.eq('channel', channel);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data, total: count ?? 0, page, limit });
  } catch (err) {
    console.error('List campaigns error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Use admin client to bypass RLS
    const admin = createAdminClient();
    const { data: employee } = await admin
      .from('employees')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = campaignCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from('campaigns')
      .insert({
        ...parsed.data,
        status: 'draft',
        created_by: employee.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Insert A/B test variants if provided
    if (body.variants && Array.isArray(body.variants) && body.variants.length > 0) {
      const variantRows = body.variants.map((v: { label: string; messageBody: string; emailSubject?: string; splitPercentage: number }) => ({
        campaign_id: data.id,
        variant_label: v.label,
        message_body: v.messageBody,
        email_subject: v.emailSubject || null,
        split_percentage: v.splitPercentage,
      }));
      await admin.from('campaign_variants').insert(variantRows);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('Create campaign error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
