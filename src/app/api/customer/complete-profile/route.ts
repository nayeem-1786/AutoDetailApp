import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const completeProfileSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
});

/**
 * PATCH /api/customer/complete-profile
 * Lightweight profile completion for existing customers missing name data.
 * Used during booking auth when a voice-agent-created customer signs in
 * but has incomplete profile data (e.g., missing last_name).
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = completeProfileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { first_name, last_name, email } = parsed.data;
    const admin = createAdminClient();

    const { data: customer } = await admin
      .from('customers')
      .select('id, email')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer record not found' },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = {
      first_name,
      last_name,
      updated_at: new Date().toISOString(),
    };

    // Only update email if provided and customer doesn't already have one
    if (email && !customer.email) {
      updates.email = email;
    }

    const { error: updateErr } = await admin
      .from('customers')
      .update(updates)
      .eq('id', customer.id);

    if (updateErr) {
      console.error('Complete profile update failed:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Complete profile error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
