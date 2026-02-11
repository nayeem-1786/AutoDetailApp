import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
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
      .select('id, role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch original campaign
    const { data: original, error: fetchErr } = await admin
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !original) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Generate unique copy name
    const baseName = original.name;
    const copyName = await generateCopyName(admin, baseName);

    // Insert new campaign with copied fields
    const { data: newCampaign, error: insertErr } = await admin
      .from('campaigns')
      .insert({
        name: copyName,
        channel: original.channel,
        status: 'draft',
        audience_filters: original.audience_filters,
        sms_template: original.sms_template,
        email_subject: original.email_subject,
        email_template: original.email_template,
        coupon_id: original.coupon_id,
        auto_select_winner: original.auto_select_winner,
        auto_select_after_hours: original.auto_select_after_hours,
        created_by: employee.id,
      })
      .select()
      .single();

    if (insertErr || !newCampaign) throw insertErr;

    // Copy A/B variants if they exist
    const { data: variants } = await admin
      .from('campaign_variants')
      .select('*')
      .eq('campaign_id', id)
      .order('variant_label');

    if (variants && variants.length > 0) {
      const variantRows = variants.map((v: { variant_label: string; message_body: string; email_subject: string | null; split_percentage: number }) => ({
        campaign_id: newCampaign.id,
        variant_label: v.variant_label,
        message_body: v.message_body,
        email_subject: v.email_subject,
        split_percentage: v.split_percentage,
        is_winner: false,
      }));
      await admin.from('campaign_variants').insert(variantRows);
    }

    return NextResponse.json({ data: { id: newCampaign.id } }, { status: 201 });
  } catch (err) {
    console.error('Duplicate campaign error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function generateCopyName(
  admin: ReturnType<typeof createAdminClient>,
  baseName: string
): Promise<string> {
  // Strip existing "(Copy)" / "(Copy N)" suffix to get the root name
  const rootName = baseName.replace(/\s*\(Copy(?:\s+\d+)?\)$/, '');
  const candidate = `${rootName} (Copy)`;

  // Check if any campaigns already use this name pattern
  const { data: existing } = await admin
    .from('campaigns')
    .select('name')
    .like('name', `${rootName} (Copy%`);

  if (!existing || existing.length === 0) {
    return candidate;
  }

  const existingNames = new Set(existing.map((c: { name: string }) => c.name));

  if (!existingNames.has(candidate)) {
    return candidate;
  }

  // Find next available number
  for (let i = 2; i <= existingNames.size + 2; i++) {
    const numbered = `${rootName} (Copy ${i})`;
    if (!existingNames.has(numbered)) {
      return numbered;
    }
  }

  return `${rootName} (Copy ${Date.now()})`;
}
