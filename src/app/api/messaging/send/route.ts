import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMessageSchema } from '@/lib/utils/validation';
import { sendSms } from '@/lib/utils/sms';

export async function POST(request: NextRequest) {
  // Step 1: Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Role check
  const { data: employee } = await supabase
    .from('employees')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single();

  if (!employee || !['super_admin', 'admin', 'cashier', 'detailer'].includes(employee.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Step 3: Validate body
  const body = await request.json();
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { conversation_id, body: messageBody } = parsed.data;
  const admin = createAdminClient();

  // Load conversation
  const { data: conversation, error: convError } = await admin
    .from('conversations')
    .select('id, phone_number')
    .eq('id', conversation_id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Send SMS via Twilio
  const smsResult = await sendSms(conversation.phone_number, messageBody);

  const messageStatus = smsResult.success ? 'sent' : 'failed';
  const twilioSid = smsResult.success ? smsResult.sid : null;

  // Insert the outbound message
  const { data: message, error: msgError } = await admin
    .from('messages')
    .insert({
      conversation_id,
      direction: 'outbound',
      body: messageBody,
      sender_type: 'staff',
      sent_by: employee.id,
      twilio_sid: twilioSid,
      status: messageStatus,
    })
    .select()
    .single();

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  // Update conversation
  await admin
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: messageBody.substring(0, 200),
      unread_count: 0,
    })
    .eq('id', conversation_id);

  if (!smsResult.success) {
    return NextResponse.json(
      { data: message, warning: 'Message saved but SMS delivery failed' },
      { status: 201 }
    );
  }

  return NextResponse.json({ data: message }, { status: 201 });
}
