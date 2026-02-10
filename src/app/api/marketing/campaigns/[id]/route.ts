import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { campaignUpdateSchema } from '@/lib/utils/validation';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: employee } = await admin
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await admin
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get recipient stats
    const { count: recipientCount } = await admin
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', id);

    // Load A/B test variants
    const { data: dbVariants } = await admin
      .from('campaign_variants')
      .select('*')
      .eq('campaign_id', id)
      .order('variant_label');

    const variants = dbVariants && dbVariants.length > 0
      ? dbVariants.map((v: { variant_label: string; message_body: string; email_subject: string | null; split_percentage: number }) => ({
          label: v.variant_label,
          messageBody: v.message_body,
          emailSubject: v.email_subject || '',
          splitPercentage: v.split_percentage,
        }))
      : null;

    return NextResponse.json({
      data: { ...data, total_recipients: recipientCount ?? 0, variants },
    });
  } catch (err) {
    console.error('Get campaign error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: employee } = await admin
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check current status — only draft/scheduled can be edited
    const { data: existing } = await admin
      .from('campaigns')
      .select('status')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    if (!['draft', 'scheduled'].includes(existing.status)) {
      return NextResponse.json(
        { error: 'Can only edit draft or scheduled campaigns' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = campaignUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from('campaigns')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Replace A/B test variants when the key is present in the body
    if ('variants' in body) {
      // Delete existing variants
      await admin.from('campaign_variants').delete().eq('campaign_id', id);

      // Insert new ones if provided
      if (body.variants && Array.isArray(body.variants) && body.variants.length > 0) {
        const variantRows = body.variants.map((v: { label: string; messageBody: string; emailSubject?: string; splitPercentage: number }) => ({
          campaign_id: id,
          variant_label: v.label,
          message_body: v.messageBody,
          email_subject: v.emailSubject || null,
          split_percentage: v.splitPercentage,
        }));
        await admin.from('campaign_variants').insert(variantRows);
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Update campaign error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: employee } = await admin
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only draft campaigns can be deleted
    const { data: existing } = await admin
      .from('campaigns')
      .select('status')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: 'Can only delete draft campaigns' },
        { status: 400 }
      );
    }

    const { error } = await admin
      .from('campaigns')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete campaign error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
