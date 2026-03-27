import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';
import { generateConversationSummary } from '@/lib/services/conversation-summary';
import { createQuote } from '@/lib/quotes/quote-service';
import { createShortLink } from '@/lib/utils/short-link';
import { resolveServiceByName } from '@/lib/services/service-resolver';
import { getBusinessInfo } from '@/lib/data/business';

// ---------------------------------------------------------------------------
// Shared post-call processing logic
// Used by: finalize_call tool, polling cron, call-complete webhook
// ---------------------------------------------------------------------------

export interface ProcessVoiceCallParams {
  phone: string;
  transcriptSummary?: string;
  servicesDiscussed?: string[];
  appointmentBooked?: boolean;
  customerInterest?: string;
  customerName?: string;
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  customerType?: string;
  durationSeconds?: number;
  elevenlabsConversationId?: string;
  source: 'tool' | 'poll' | 'webhook';
  /** Skip auto-quote if send_quote_sms was already called during this call */
  skipAutoQuote?: boolean;
}

export interface ProcessVoiceCallResult {
  success: boolean;
  conversationId?: string;
  skipped?: boolean;
  reason?: string;
}

export async function processVoiceCallEnd(
  params: ProcessVoiceCallParams
): Promise<ProcessVoiceCallResult> {
  const admin = createAdminClient();
  const normalizedPhone = normalizePhone(params.phone);

  if (!normalizedPhone) {
    return { success: false, reason: 'Invalid phone number' };
  }

  // Dedup check: skip if this conversation was already processed
  if (params.elevenlabsConversationId) {
    const { data: existing } = await admin
      .from('voice_call_log')
      .select('id')
      .eq('elevenlabs_conversation_id', params.elevenlabsConversationId)
      .maybeSingle();

    if (existing) {
      console.log(`[VoicePostCall] Already processed: ${params.elevenlabsConversationId}`);
      return { success: true, skipped: true, reason: 'Already processed' };
    }
  }

  // Find customer by phone
  const { data: customer } = await admin
    .from('customers')
    .select('id, first_name, sms_consent, customer_type')
    .eq('phone', normalizedPhone)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  // Upgrade generic customer name if a real name is available
  if (customer && params.customerName && params.customerName.trim().length > 0) {
    const GENERIC_FIRST_NAMES = ['phone', 'new', 'customer', 'valued'];
    if (
      customer.first_name &&
      GENERIC_FIRST_NAMES.includes(customer.first_name.toLowerCase())
    ) {
      const nameParts = params.customerName.trim().split(/\s+/);
      const newFirst = nameParts[0];
      const newLast = nameParts.slice(1).join(' ') || '';
      await admin
        .from('customers')
        .update({ first_name: newFirst, last_name: newLast })
        .eq('id', customer.id);
      customer.first_name = newFirst;
      console.log(`[VoicePostCall] Upgrading customer name from "${customer.first_name}" to "${params.customerName.trim()}" for ${normalizedPhone}`);
    }
  }

  // Classify customer type — tool params take priority, transcript inference as fallback
  const validTypes = ['enthusiast', 'professional'];
  if (customer && !customer.customer_type) {
    let resolvedType: string | null = null;

    if (params.customerType && validTypes.includes(params.customerType)) {
      resolvedType = params.customerType;
    } else {
      resolvedType = inferCustomerType(params.transcriptSummary || '');
    }

    if (resolvedType) {
      await admin
        .from('customers')
        .update({ customer_type: resolvedType })
        .eq('id', customer.id);
      console.log(`[VoicePostCall] Set customer_type to "${resolvedType}" for ${normalizedPhone} (source: ${params.customerType ? 'tool' : 'transcript'})`);
    }
  }

  // Resolve vehicle info — tool params take priority, transcript extraction as fallback
  let resolvedVehicleMake = params.vehicleMake;
  let resolvedVehicleModel = params.vehicleModel;
  let resolvedVehicleYear = params.vehicleYear;
  let resolvedVehicleColor = params.vehicleColor;

  if (!resolvedVehicleMake && !resolvedVehicleModel && params.transcriptSummary) {
    const extracted = extractVehicleFromTranscript(params.transcriptSummary);
    if (extracted) {
      resolvedVehicleMake = extracted.vehicleMake;
      resolvedVehicleModel = extracted.vehicleModel;
      resolvedVehicleYear = extracted.vehicleYear ? parseInt(extracted.vehicleYear, 10) || undefined : undefined;
      resolvedVehicleColor = extracted.vehicleColor;
      console.log(`[VoicePostCall] Extracted vehicle from transcript: ${extracted.vehicleYear || ''} ${extracted.vehicleColor || ''} ${extracted.vehicleMake || ''} ${extracted.vehicleModel || ''}`);
    }
  }

  // Track resolved customer ID — may be set later by autoGenerateQuote for new callers
  let resolvedCustomerId: string | null = customer?.id || null;

  // Build the message body
  const messageBody = buildCallMessage(
    params.transcriptSummary,
    params.durationSeconds
  );

  // Find or create conversation
  const now = new Date().toISOString();
  let conversation: { id: string; customer_id: string | null } | null = null;

  const { data: existingConv } = await admin
    .from('conversations')
    .select('id, customer_id')
    .eq('phone_number', normalizedPhone)
    .single();

  if (!existingConv) {
    const { data: newConv, error: convErr } = await admin
      .from('conversations')
      .insert({
        phone_number: normalizedPhone,
        customer_id: customer?.id || null,
        is_ai_enabled: true,
        status: 'open',
        last_message_at: now,
        last_message_preview: messageBody.substring(0, 200),
        last_channel: 'voice',
        unread_count: 1,
      })
      .select('id, customer_id')
      .single();

    if (convErr || !newConv) {
      console.error('[VoicePostCall] Failed to create conversation:', convErr);
      return { success: false, reason: 'Failed to create conversation' };
    }
    conversation = newConv;
  } else {
    const updates: Record<string, unknown> = {
      last_message_at: now,
      last_message_preview: messageBody.substring(0, 200),
      last_channel: 'voice',
      status: 'open',
    };
    if (!existingConv.customer_id && customer?.id) {
      updates.customer_id = customer.id;
    }
    await admin
      .from('conversations')
      .update(updates)
      .eq('id', existingConv.id);
    conversation = existingConv;
  }

  // Insert voice message
  await admin.from('messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    body: messageBody,
    sender_type: 'system',
    status: 'received',
    channel: 'voice',
    voice_duration_seconds: params.durationSeconds || null,
  });

  // Regenerate conversation summary
  generateConversationSummary(conversation.id).catch((err) => {
    console.error('[VoicePostCall] Summary generation failed:', err);
  });

  // Post-call actions: auto-quote or confirmation SMS
  const servicesDiscussed = params.servicesDiscussed || [];
  const appointmentBooked = params.appointmentBooked === true;
  const customerInterest = params.customerInterest || 'interested';

  console.log(
    `[VoicePostCall] Processing voice call end for ${normalizedPhone},` +
    ` services: [${servicesDiscussed.join(', ')}],` +
    ` interest: ${customerInterest},` +
    ` booked: ${appointmentBooked}`
  );

  // For new callers on non-auto-quote paths (appointment booked, not interested, no services),
  // create a customer record so vehicle info isn't lost
  if (!resolvedCustomerId && (resolvedVehicleMake || resolvedVehicleModel || params.customerName)) {
    const { data: phoneCustomer } = await admin
      .from('customers')
      .select('id, first_name')
      .eq('phone', normalizedPhone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (phoneCustomer) {
      resolvedCustomerId = phoneCustomer.id;
      // Upgrade generic name if real name available
      const GENERIC_FIRST_NAMES = ['phone', 'new', 'customer', 'valued'];
      if (
        phoneCustomer.first_name &&
        GENERIC_FIRST_NAMES.includes(phoneCustomer.first_name.toLowerCase()) &&
        params.customerName &&
        params.customerName.trim().length > 0
      ) {
        const nameParts = params.customerName.trim().split(/\s+/);
        await admin
          .from('customers')
          .update({ first_name: nameParts[0], last_name: nameParts.slice(1).join(' ') || '' })
          .eq('id', phoneCustomer.id);
        console.log(`[VoicePostCall] Upgrading customer name from "${phoneCustomer.first_name}" to "${params.customerName.trim()}" for ${normalizedPhone}`);
      }
    } else {
      const fallbackName = params.customerName?.trim() || 'Phone Caller';
      const nameParts = fallbackName.split(/\s+/);
      const inferredType = inferCustomerType(params.transcriptSummary || '');
      const { data: newCust } = await admin
        .from('customers')
        .insert({
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' ') || '',
          phone: normalizedPhone,
          sms_consent: true,
          customer_type: inferredType,
        })
        .select('id')
        .single();
      if (newCust) {
        resolvedCustomerId = newCust.id;
        console.log(`[VoicePostCall] Created customer "${fallbackName}" (${inferredType}) for ${normalizedPhone} (non-quote path)`);
      }
    }
  }

  // Find or create vehicle — runs BEFORE autoGenerateQuote so vehicle_id is available for quotes
  let resolvedVehicleId: string | undefined;
  if (resolvedCustomerId && (resolvedVehicleMake || resolvedVehicleModel)) {
    let vehicleQuery = admin
      .from('vehicles')
      .select('id')
      .eq('customer_id', resolvedCustomerId);

    if (resolvedVehicleMake) vehicleQuery = vehicleQuery.ilike('make', resolvedVehicleMake);
    if (resolvedVehicleModel) vehicleQuery = vehicleQuery.ilike('model', resolvedVehicleModel);

    const { data: existingVehicle } = await vehicleQuery.limit(1).maybeSingle();

    if (existingVehicle) {
      resolvedVehicleId = existingVehicle.id;
    } else {
      const { data: newVehicle } = await admin
        .from('vehicles')
        .insert({
          customer_id: resolvedCustomerId,
          vehicle_type: 'standard',
          year: resolvedVehicleYear || null,
          make: resolvedVehicleMake || null,
          model: resolvedVehicleModel || null,
          color: resolvedVehicleColor || null,
        })
        .select('id')
        .single();
      resolvedVehicleId = newVehicle?.id;
      console.log(`[VoicePostCall] Created vehicle ${resolvedVehicleYear || ''} ${resolvedVehicleColor || ''} ${resolvedVehicleMake || ''} ${resolvedVehicleModel || ''} for ${normalizedPhone}`);
    }
  }

  if (appointmentBooked) {
    // Send confirmation SMS
    console.log(`[VoicePostCall] Auto-quote decision: skipping — reason: appointment already booked`);
    if (customer?.sms_consent) {
      const biz = await getBusinessInfo();
      const name = customer.first_name ? `, ${customer.first_name}` : '';
      const smsBody = `Thanks for calling ${biz.name}${name}! Your appointment is confirmed. We look forward to seeing you! Reply STOP to opt out.`;
      const smsResult = await sendSms(normalizedPhone, smsBody);
      console.log(`[VoicePostCall] SMS send result: ${smsResult.success ? 'success' : 'failure — ' + ('error' in smsResult ? smsResult.error : 'unknown')}`);

      await admin.from('messages').insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        body: smsBody,
        sender_type: 'system',
        status: 'delivered',
        channel: 'sms',
      });
    } else {
      console.log(`[VoicePostCall] SMS send result: skipped — no SMS consent (customer: ${customer?.id || 'not found'})`);
    }
  } else if (servicesDiscussed.length === 0) {
    console.log(`[VoicePostCall] Auto-quote decision: skipping — reason: no services discussed`);
  } else if (customerInterest === 'not_interested') {
    console.log(`[VoicePostCall] Auto-quote decision: skipping — reason: customer not interested`);
  } else if (params.skipAutoQuote) {
    console.log(`[VoicePostCall] Auto-quote decision: skipping — reason: skipAutoQuote flag set`);
  } else {
    // Check for recent quotes sent in the last 10 minutes (dedup with send_quote_sms)
    if (resolvedCustomerId) {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recentQuotes } = await admin
        .from('quotes')
        .select('id')
        .eq('customer_id', resolvedCustomerId)
        .gte('created_at', tenMinutesAgo)
        .limit(1);

      if (recentQuotes && recentQuotes.length > 0) {
        console.log(`[VoicePostCall] Auto-quote decision: skipping — reason: recent quote exists (last 10min)`);
      } else {
        console.log(`[VoicePostCall] Auto-quote decision: sending — reason: services discussed, customer interested, no recent quote`);
        const createdId = await autoGenerateQuote(
          admin,
          normalizedPhone,
          servicesDiscussed,
          resolvedCustomerId,
          conversation.id,
          params.customerName,
          resolvedVehicleId,
          params.transcriptSummary
        );
        if (createdId) resolvedCustomerId = createdId;
      }
    } else {
      // No existing customer — create one and send auto-quote
      console.log(`[VoicePostCall] Auto-quote decision: sending — reason: services discussed, customer interested, new caller (will create customer)`);
      const createdId = await autoGenerateQuote(
        admin,
        normalizedPhone,
        servicesDiscussed,
        null,
        conversation.id,
        params.customerName,
        resolvedVehicleId,
        params.transcriptSummary
      );
      if (createdId) resolvedCustomerId = createdId;
    }
  }

  // Insert into voice_call_log for dedup
  if (params.elevenlabsConversationId) {
    await admin.from('voice_call_log').insert({
      elevenlabs_conversation_id: params.elevenlabsConversationId,
      phone: normalizedPhone,
      source: params.source,
    }).then(({ error }) => {
      if (error) {
        // Unique constraint violation = already processed (race condition), safe to ignore
        if (!error.code?.includes('23505')) {
          console.error('[VoicePostCall] Failed to insert voice_call_log:', error);
        }
      }
    });
  }

  console.log(
    `[VoicePostCall] Processed call for ${normalizedPhone}` +
    ` (source: ${params.source})` +
    (params.elevenlabsConversationId ? ` (conv: ${params.elevenlabsConversationId})` : '') +
    (params.durationSeconds ? ` — ${params.durationSeconds}s` : '')
  );

  return { success: true, conversationId: conversation.id };
}

// ---------------------------------------------------------------------------
// Auto-generate and send quote
// ---------------------------------------------------------------------------

/** Returns the resolved customer ID (found or created) so the caller can use it */
async function autoGenerateQuote(
  admin: ReturnType<typeof createAdminClient>,
  phone: string,
  servicesDiscussed: string[],
  customerId: string | null,
  conversationId: string,
  customerName?: string,
  vehicleId?: string,
  transcriptSummary?: string
): Promise<string | null> {
  // Resolve service names to IDs
  const quoteItems: Array<{
    service_id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    tier_name: string | null;
  }> = [];

  for (const serviceName of servicesDiscussed) {
    const service = await resolveServiceByName(admin, serviceName.trim());
    if (!service) {
      console.warn(`[VoicePostCall] Service not found: "${serviceName}"`);
      continue;
    }
    let price = service.flat_price ?? 0;
    let tierName: string | null = null;
    if (service.service_pricing?.length > 0) {
      price = service.service_pricing[0].price;
      tierName = service.service_pricing[0].tier_name;
    }
    quoteItems.push({
      service_id: service.id,
      item_name: service.name,
      quantity: 1,
      unit_price: price,
      tier_name: tierName,
    });
  }

  if (quoteItems.length === 0) {
    console.log('[VoicePostCall] Auto-quote aborted — no services resolved to valid IDs');
    return customerId;
  }

  // Find or create customer
  let custId = customerId;
  if (!custId) {
    const { data: existing } = await admin
      .from('customers')
      .select('id, first_name')
      .eq('phone', phone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (existing) {
      custId = existing.id;

      // Update generic name with real name if available
      const GENERIC_FIRST_NAMES = ['phone', 'new', 'customer', 'valued'];
      if (
        existing.first_name &&
        GENERIC_FIRST_NAMES.includes(existing.first_name.toLowerCase()) &&
        customerName &&
        customerName.trim().length > 0
      ) {
        const nameParts = customerName.trim().split(/\s+/);
        await admin
          .from('customers')
          .update({ first_name: nameParts[0], last_name: nameParts.slice(1).join(' ') || '' })
          .eq('id', existing.id);
        console.log(`[VoicePostCall] Updated generic name to "${customerName.trim()}" for ${phone}`);
      }
    } else {
      // Create fallback customer — a quote with a generic name is better than no quote
      const fallbackName = customerName?.trim() || 'Phone Caller';
      const nameParts = fallbackName.split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || '';
      const inferredType = inferCustomerType(transcriptSummary || '');

      const { data: newCust, error: custErr } = await admin
        .from('customers')
        .insert({
          first_name: firstName,
          last_name: lastName,
          phone,
          sms_consent: true,
          customer_type: inferredType,
        })
        .select('id')
        .single();

      if (custErr || !newCust) {
        console.error('[VoicePostCall] Failed to create fallback customer:', custErr);
        return null;
      }
      custId = newCust.id;
      console.log(`[VoicePostCall] Created fallback customer "${firstName} ${lastName || ''}" (${inferredType}) for ${phone}`);
    }
  }

  // Read quote validity
  const { data: validitySetting } = await admin
    .from('business_settings')
    .select('value')
    .eq('key', 'quote_validity_days')
    .maybeSingle();

  let quoteValidityDays = 10;
  if (validitySetting?.value) {
    try {
      const parsed = JSON.parse(validitySetting.value);
      if (typeof parsed === 'number' && parsed > 0) quoteValidityDays = parsed;
    } catch { /* use fallback */ }
  }

  const validUntil = new Date(Date.now() + quoteValidityDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { quote } = await createQuote(admin, {
      customer_id: custId,
      vehicle_id: vehicleId,
      items: quoteItems,
      notes: 'Auto-generated after phone call',
      valid_until: validUntil,
    });

    const quoteRecord = quote as { id: string; quote_number: string; access_token: string };

    // Mark as sent
    await admin
      .from('quotes')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', quoteRecord.id);

    // Generate short link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const quoteUrl = `${appUrl}/quote/${quoteRecord.access_token}`;
    let linkUrl = quoteUrl;
    try { linkUrl = await createShortLink(quoteUrl); } catch { /* use full URL */ }

    // Send SMS if customer has consent
    const { data: custCheck } = await admin
      .from('customers')
      .select('sms_consent')
      .eq('id', custId)
      .single();

    if (custCheck?.sms_consent) {
      const biz = await getBusinessInfo();
      const quoteSmsBody = `Thanks for calling ${biz.name}! Here's a quote for what we discussed: ${linkUrl}\n\nReply STOP to opt out.`;
      const smsResult = await sendSms(phone, quoteSmsBody);
      console.log(`[VoicePostCall] SMS send result: ${smsResult.success ? 'success' : 'failure — ' + ('error' in smsResult ? smsResult.error : 'unknown')}`);

      await admin.from('messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        body: quoteSmsBody,
        sender_type: 'system',
        status: 'delivered',
        channel: 'sms',
      });
    } else {
      console.log(`[VoicePostCall] SMS send result: skipped — no SMS consent (customer: ${custId})`);
    }

    // Log system note
    const serviceNames = quoteItems.map((i) => i.item_name).join(', ');
    await admin.from('messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      body: `Auto-quote ${quoteRecord.quote_number} generated after phone call: ${serviceNames}`,
      sender_type: 'system',
      status: 'delivered',
      channel: 'voice',
    });

    // Log quote communication
    await admin.from('quote_communications').insert({
      quote_id: quoteRecord.id,
      channel: 'sms',
      sent_to: phone,
      status: 'sent',
    });

    console.log(`[VoicePostCall] Auto-quote ${quoteRecord.quote_number} sent to ${phone}`);
  } catch (err) {
    console.error('[VoicePostCall] Quote creation failed:', err);
  }

  return custId;
}

// ---------------------------------------------------------------------------
// Transcript inference helpers
// ---------------------------------------------------------------------------

/** Infer customer type from transcript keywords. Defaults to 'enthusiast'. */
function inferCustomerType(transcript: string): 'enthusiast' | 'professional' {
  if (!transcript) return 'enthusiast';
  const lower = transcript.toLowerCase();
  const professionalKeywords = [
    'dealership', 'dealer', 'fleet', 'wholesale',
    'shop', 'we detail', 'our shop', 'my shop',
    'body shop', 'auto body', 'commercial',
    'multiple cars', 'multiple vehicles', 'bulk',
    'reseller', 'lot', 'car lot', 'used car',
    'detailing business', 'my business', 'our business',
  ];
  return professionalKeywords.some((kw) => lower.includes(kw)) ? 'professional' : 'enthusiast';
}

/** Extract vehicle info from transcript text. Best-effort, returns null if nothing found. */
function extractVehicleFromTranscript(transcript: string): {
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
} | null {
  if (!transcript) return null;

  const MAKES: Record<string, string> = {
    honda: 'Honda', toyota: 'Toyota', bmw: 'BMW', mercedes: 'Mercedes',
    ford: 'Ford', chevrolet: 'Chevrolet', chevy: 'Chevrolet', tesla: 'Tesla',
    nissan: 'Nissan', hyundai: 'Hyundai', kia: 'Kia', lexus: 'Lexus',
    audi: 'Audi', volkswagen: 'Volkswagen', vw: 'Volkswagen', subaru: 'Subaru',
    mazda: 'Mazda', jeep: 'Jeep', dodge: 'Dodge', ram: 'Ram', gmc: 'GMC',
    cadillac: 'Cadillac', lincoln: 'Lincoln', acura: 'Acura', infiniti: 'Infiniti',
    porsche: 'Porsche', volvo: 'Volvo', buick: 'Buick', chrysler: 'Chrysler',
    mitsubishi: 'Mitsubishi', mini: 'Mini', 'land rover': 'Land Rover',
  };

  const MODELS: Record<string, string[]> = {
    Honda: ['Accord', 'Civic', 'CR-V', 'Pilot', 'HR-V', 'Odyssey', 'Ridgeline', 'Fit', 'Passport', 'Element', 'S2000', 'Insight'],
    Toyota: ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Tacoma', 'Tundra', '4Runner', 'Prius', 'Supra', 'Sienna', 'Avalon', 'Venza', 'GR86', 'Land Cruiser'],
    BMW: ['X1', 'X3', 'X5', 'X7', 'M3', 'M4', 'M5', 'M540i', 'M550i', '328i', '330i', '340i', '528i', '530i', '540i', '740i', '750i'],
    Mercedes: ['C-Class', 'E-Class', 'S-Class', 'GLC', 'GLE', 'GLS', 'A-Class', 'CLA', 'AMG', 'C300', 'E350', 'S500'],
    Ford: ['F-150', 'Mustang', 'Explorer', 'Escape', 'Bronco', 'Edge', 'Ranger', 'Expedition', 'Maverick', 'Focus', 'Fusion', 'F-250', 'F-350'],
    Chevrolet: ['Silverado', 'Camaro', 'Corvette', 'Equinox', 'Tahoe', 'Suburban', 'Traverse', 'Malibu', 'Blazer', 'Colorado', 'Impala', 'Trax'],
    Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'],
    Nissan: ['Altima', 'Maxima', 'Sentra', 'Rogue', 'Pathfinder', 'Frontier', 'Titan', '370Z', 'GT-R', 'Murano', 'Kicks', 'Armada'],
    Hyundai: ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Palisade', 'Kona', 'Ioniq', 'Venue', 'Genesis'],
    Kia: ['Forte', 'Optima', 'K5', 'Sorento', 'Sportage', 'Telluride', 'Soul', 'Stinger', 'Seltos', 'Carnival'],
    Lexus: ['IS', 'ES', 'GS', 'LS', 'RX', 'NX', 'UX', 'GX', 'LX', 'RC', 'LC'],
    Audi: ['A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'RS', 'S4', 'S5', 'TT', 'R8', 'e-tron'],
    Volkswagen: ['Jetta', 'Passat', 'Golf', 'GTI', 'Tiguan', 'Atlas', 'Arteon', 'ID.4', 'Taos'],
    Subaru: ['Outback', 'Forester', 'Crosstrek', 'Impreza', 'WRX', 'Legacy', 'Ascent', 'BRZ'],
    Mazda: ['Mazda3', 'Mazda6', 'CX-5', 'CX-9', 'CX-30', 'CX-50', 'MX-5', 'Miata'],
    Jeep: ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade', 'Gladiator'],
    Dodge: ['Charger', 'Challenger', 'Durango', 'Hornet'],
    Ram: ['1500', '2500', '3500'],
    GMC: ['Sierra', 'Yukon', 'Terrain', 'Acadia', 'Canyon', 'Denali'],
    Cadillac: ['Escalade', 'CT4', 'CT5', 'XT4', 'XT5', 'XT6', 'Lyriq'],
    Lincoln: ['Navigator', 'Aviator', 'Corsair', 'Nautilus'],
    Acura: ['TLX', 'MDX', 'RDX', 'Integra', 'NSX', 'ILX'],
    Infiniti: ['Q50', 'Q60', 'QX50', 'QX55', 'QX60', 'QX80'],
    Porsche: ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan', 'Boxster', 'Cayman'],
    Volvo: ['XC40', 'XC60', 'XC90', 'S60', 'S90', 'V60', 'V90'],
  };

  const COLORS = [
    'black', 'white', 'silver', 'gray', 'grey', 'red', 'blue', 'green',
    'gold', 'brown', 'orange', 'yellow', 'purple', 'beige', 'tan',
  ];

  // Split transcript into sentences for context-bounded searching
  const sentences = transcript.split(/[.\n]+/).map((s) => s.trim()).filter(Boolean);

  // Search sentences in reverse — last mention is most likely the actual vehicle
  let foundMake: string | undefined;
  let foundModel: string | undefined;
  let foundYear: string | undefined;
  let foundColor: string | undefined;

  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentence = sentences[i].toLowerCase();

    // Find make in this sentence
    for (const [key, canonical] of Object.entries(MAKES)) {
      if (sentence.includes(key)) {
        foundMake = canonical;

        // Look for model in same sentence
        const models = MODELS[canonical] || [];
        for (const model of models) {
          if (sentence.includes(model.toLowerCase())) {
            foundModel = model;
            break;
          }
        }

        // Look for year (4-digit 1990-2030) in same sentence
        const yearMatch = sentence.match(/\b(199\d|20[0-3]\d)\b/);
        if (yearMatch) foundYear = yearMatch[1];

        // Look for color in same sentence
        for (const color of COLORS) {
          if (sentence.includes(color)) {
            foundColor = color === 'grey' ? 'Gray' : color.charAt(0).toUpperCase() + color.slice(1);
            break;
          }
        }

        break; // Found a make in this sentence, stop searching makes
      }
    }

    if (foundMake) break; // Found in this sentence, stop searching sentences
  }

  if (!foundMake) return null;

  return {
    vehicleMake: foundMake,
    vehicleModel: foundModel,
    vehicleYear: foundYear,
    vehicleColor: foundColor,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCallMessage(
  summary?: string,
  durationSeconds?: number
): string {
  const parts: string[] = ['Phone call'];

  if (durationSeconds) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    parts[0] += ` (${mins}:${String(secs).padStart(2, '0')})`;
  }

  if (summary) {
    parts.push(`Summary: ${summary}`);
  }

  return parts.join('\n');
}
