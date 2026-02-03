import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateApiKey } from '@/lib/auth/api-key';

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data: services, error } = await supabase
      .from('services')
      .select(`
        id,
        name,
        description,
        pricing_model,
        base_duration_minutes,
        mobile_eligible,
        service_categories ( name ),
        service_pricing ( tier_name, price )
      `)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Voice agent services query error:', error.message);
      return NextResponse.json(
        { error: 'Failed to fetch services' },
        { status: 500 }
      );
    }

    const formatted = (services ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: (s.service_categories as unknown as { name: string } | null)?.name ?? null,
      duration_minutes: s.base_duration_minutes,
      pricing_model: s.pricing_model,
      mobile_eligible: s.mobile_eligible,
      pricing: ((s.service_pricing as { tier_name: string; price: number }[]) ?? []).map(
        (p) => ({
          tier_name: p.tier_name,
          price: Number(p.price),
        })
      ),
    }));

    return NextResponse.json({ services: formatted });
  } catch (err) {
    console.error('Voice agent services error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
