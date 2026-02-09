import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/utils/sms';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single();

  if (!employee || !['super_admin', 'admin', 'cashier', 'detailer'].includes(employee.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const before = searchParams.get('before'); // cursor for pagination

  let query = admin
    .from('messages')
    .select('*, sender:employees!sent_by(id, first_name, last_name)')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data: messages, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: messages });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role, first_name, last_name')
    .eq('auth_user_id', user.id)
    .single();

  if (!employee || !['super_admin', 'admin', 'cashier', 'detailer'].includes(employee.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const messageBody = body.body?.trim();

  if (!messageBody) {
    return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
  }

  if (messageBody.length > 1600) {
    return NextResponse.json({ error: 'Message too long (max 1600 characters)' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get conversation to find phone number and AI status
  const { data: conversation, error: convError } = await admin
    .from('conversations')
    .select('phone_number, status, is_ai_enabled')
    .eq('id', id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Send SMS via Twilio
  const smsResult = await sendSms(conversation.phone_number, messageBody);

  const messageStatus = smsResult.success ? 'sent' : 'failed';
  const twilioSid = smsResult.success ? smsResult.sid : null;

  // Store message
  const { data: message, error: msgError } = await admin
    .from('messages')
    .insert({
      conversation_id: id,
      direction: 'outbound',
      body: messageBody,
      sender_type: 'staff',
      sent_by: employee.id,
      twilio_sid: twilioSid,
      status: messageStatus,
    })
    .select('*, sender:employees!sent_by(id, first_name, last_name)')
    .single();

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  // Update conversation
  const updates: Record<string, unknown> = {
    last_message_at: new Date().toISOString(),
    last_message_preview: messageBody.slice(0, 100),
  };

  // Reopen if closed
  if (conversation.status === 'closed' || conversation.status === 'archived') {
    updates.status = 'open';
  }

  // If staff is replying to an AI-enabled conversation, disable AI (human took over)
  if (conversation.is_ai_enabled) {
    updates.is_ai_enabled = false;
  }

  await admin.from('conversations').update(updates).eq('id', id);

  if (!smsResult.success) {
    return NextResponse.json({ data: message, warning: 'Message saved but SMS delivery failed' }, { status: 201 });
  }

  return NextResponse.json({ data: message }, { status: 201 });
}
