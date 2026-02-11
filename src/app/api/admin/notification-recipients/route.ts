import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    const type = searchParams.get('type');

    let query = admin
      .from('notification_recipients')
      .select('*')
      .order('created_at', { ascending: true });

    if (type) {
      query = query.eq('notification_type', type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch notification recipients:', error);
      return NextResponse.json({ error: 'Failed to fetch recipients' }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('Notification recipients GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: employee } = await admin
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();

    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { email, notification_type = 'low_stock' } = body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    if (!['low_stock', 'all'].includes(notification_type)) {
      return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
    }

    // Check for duplicate
    const { data: existing } = await admin
      .from('notification_recipients')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .eq('notification_type', notification_type)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'This email is already registered for this notification type' },
        { status: 409 }
      );
    }

    const { data, error } = await admin
      .from('notification_recipients')
      .insert({
        email: email.trim().toLowerCase(),
        notification_type,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create notification recipient:', error);
      return NextResponse.json({ error: 'Failed to add recipient' }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('Notification recipients POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
