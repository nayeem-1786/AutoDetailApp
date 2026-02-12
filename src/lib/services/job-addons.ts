/**
 * Job Addons Service
 *
 * Handles addon authorization (approve/decline) via both web link and AI SMS.
 * All status transitions, confirmation messages, and edge cases managed here.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/utils/sms';
import { getBusinessInfo } from '@/lib/data/business';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddonWithContext {
  id: string;
  job_id: string;
  service_id: string | null;
  product_id: string | null;
  custom_description: string | null;
  price: number;
  discount_amount: number;
  status: string;
  sent_at: string | null;
  expires_at: string | null;
  pickup_delay_minutes: number;
  created_by: string | null;
  // Joined
  service_name?: string;
  product_name?: string;
  employee_name?: string;
  customer_phone?: string;
  customer_first_name?: string;
}

interface AddonActionResult {
  success: boolean;
  error?: string;
  expired?: boolean;
}

interface ExtractedAddonActions {
  authorizeIds: string[];
  declineIds: string[];
  cleanedMessage: string;
}

// ---------------------------------------------------------------------------
// Extract [AUTHORIZE_ADDON:uuid] and [DECLINE_ADDON:uuid] blocks from AI text
// ---------------------------------------------------------------------------

export function extractAddonActions(aiResponse: string): ExtractedAddonActions {
  const authorizeIds: string[] = [];
  const declineIds: string[] = [];

  // Match [AUTHORIZE_ADDON:uuid] blocks
  const authorizePattern = /\[AUTHORIZE_ADDON:([a-f0-9-]+)\]/gi;
  let match: RegExpExecArray | null;
  while ((match = authorizePattern.exec(aiResponse)) !== null) {
    authorizeIds.push(match[1]);
  }

  // Match [DECLINE_ADDON:uuid] blocks
  const declinePattern = /\[DECLINE_ADDON:([a-f0-9-]+)\]/gi;
  while ((match = declinePattern.exec(aiResponse)) !== null) {
    declineIds.push(match[1]);
  }

  // Strip the blocks from the message
  const cleanedMessage = aiResponse
    .replace(/\[AUTHORIZE_ADDON:[a-f0-9-]+\]/gi, '')
    .replace(/\[DECLINE_ADDON:[a-f0-9-]+\]/gi, '')
    .trim();

  return { authorizeIds, declineIds, cleanedMessage };
}

// ---------------------------------------------------------------------------
// Approve addon — validates, updates status, sends confirmation
// ---------------------------------------------------------------------------

export async function approveAddon(addonId: string): Promise<AddonActionResult> {
  const supabase = createAdminClient();

  // Fetch addon with context
  const { data: addon, error } = await supabase
    .from('job_addons')
    .select(`
      *,
      job:jobs!job_addons_job_id_fkey(
        id,
        customer:customers!jobs_customer_id_fkey(id, first_name, phone)
      ),
      service:services!job_addons_service_id_fkey(name),
      product:products!job_addons_product_id_fkey(name)
    `)
    .eq('id', addonId)
    .single();

  if (error || !addon) {
    console.error('[AddonApprove] Addon not found:', addonId);
    return { success: false, error: 'Addon not found' };
  }

  // Check if still pending
  if (addon.status !== 'pending') {
    if (addon.status === 'expired') {
      return { success: false, error: 'Authorization has expired', expired: true };
    }
    return { success: false, error: `Addon already ${addon.status}` };
  }

  // Check expiration
  if (addon.expires_at && new Date(addon.expires_at) < new Date()) {
    // Auto-expire
    await supabase
      .from('job_addons')
      .update({ status: 'expired' })
      .eq('id', addonId);
    return { success: false, error: 'Authorization has expired', expired: true };
  }

  // Approve
  const { error: updateError } = await supabase
    .from('job_addons')
    .update({
      status: 'approved',
      responded_at: new Date().toISOString(),
    })
    .eq('id', addonId);

  if (updateError) {
    console.error('[AddonApprove] Update failed:', updateError);
    return { success: false, error: 'Failed to approve addon' };
  }

  // Send confirmation SMS to customer
  const job = addon.job as { id: string; customer: { id: string; first_name: string; phone: string | null } | null } | null;
  const customerPhone = job?.customer?.phone;
  const serviceName = getAddonName(addon);

  if (customerPhone) {
    await sendSms(customerPhone, `Great! Your add-on (${serviceName}) has been approved. We'll get started right away!`);
  }

  console.log(`[AddonApprove] Addon ${addonId} approved for job ${addon.job_id}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Decline addon — validates, updates status, sends confirmation
// ---------------------------------------------------------------------------

export async function declineAddon(addonId: string): Promise<AddonActionResult> {
  const supabase = createAdminClient();

  // Fetch addon with context
  const { data: addon, error } = await supabase
    .from('job_addons')
    .select(`
      *,
      job:jobs!job_addons_job_id_fkey(
        id,
        customer:customers!jobs_customer_id_fkey(id, first_name, phone)
      ),
      service:services!job_addons_service_id_fkey(name),
      product:products!job_addons_product_id_fkey(name)
    `)
    .eq('id', addonId)
    .single();

  if (error || !addon) {
    console.error('[AddonDecline] Addon not found:', addonId);
    return { success: false, error: 'Addon not found' };
  }

  // Check if still pending
  if (addon.status !== 'pending') {
    if (addon.status === 'expired') {
      return { success: false, error: 'Authorization has expired', expired: true };
    }
    return { success: false, error: `Addon already ${addon.status}` };
  }

  // Decline
  const { error: updateError } = await supabase
    .from('job_addons')
    .update({
      status: 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', addonId);

  if (updateError) {
    console.error('[AddonDecline] Update failed:', updateError);
    return { success: false, error: 'Failed to decline addon' };
  }

  // Send confirmation SMS to customer
  const job = addon.job as { id: string; customer: { id: string; first_name: string; phone: string | null } | null } | null;
  const customerPhone = job?.customer?.phone;
  const serviceName = getAddonName(addon);

  if (customerPhone) {
    await sendSms(customerPhone, `No problem! We've noted ${serviceName} as a recommendation for your next visit.`);
  }

  console.log(`[AddonDecline] Addon ${addonId} declined for job ${addon.job_id}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Get pending addons for a customer — used by AI prompt injection
// ---------------------------------------------------------------------------

export async function getPendingAddonsForCustomer(customerId: string): Promise<AddonWithContext[]> {
  const supabase = createAdminClient();

  // Get active jobs for this customer (in_progress or pending_approval)
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('customer_id', customerId)
    .in('status', ['in_progress', 'pending_approval', 'intake', 'scheduled', 'completed']);

  if (!jobs || jobs.length === 0) return [];

  const jobIds = jobs.map((j) => j.id);

  // Get all addons for these jobs (pending + recently resolved)
  const { data: addons } = await supabase
    .from('job_addons')
    .select(`
      id, job_id, service_id, product_id, custom_description, price,
      discount_amount, status, sent_at, expires_at, pickup_delay_minutes, created_by,
      service:services!job_addons_service_id_fkey(name),
      product:products!job_addons_product_id_fkey(name),
      employee:employees!job_addons_created_by_fkey(first_name, last_name)
    `)
    .in('job_id', jobIds)
    .order('created_at', { ascending: false });

  if (!addons) return [];

  return addons.map((a) => {
    const service = a.service as unknown as { name: string } | null;
    const product = a.product as unknown as { name: string } | null;
    const employee = a.employee as unknown as { first_name: string; last_name: string } | null;

    return {
      id: a.id,
      job_id: a.job_id,
      service_id: a.service_id,
      product_id: a.product_id,
      custom_description: a.custom_description,
      price: Number(a.price),
      discount_amount: Number(a.discount_amount),
      status: a.status,
      sent_at: a.sent_at,
      expires_at: a.expires_at,
      pickup_delay_minutes: a.pickup_delay_minutes ?? 0,
      created_by: a.created_by,
      service_name: service?.name || undefined,
      product_name: product?.name || undefined,
      employee_name: employee
        ? `${employee.first_name} ${employee.last_name}`.trim()
        : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Build AI prompt section for pending addons
// ---------------------------------------------------------------------------

export function buildAddonPromptSection(addons: AddonWithContext[]): string {
  if (addons.length === 0) return '';

  const sections: string[] = [];

  for (const addon of addons) {
    const name = getAddonNameFromContext(addon);
    const price = addon.price - addon.discount_amount;

    if (addon.status === 'pending') {
      const timeSinceSent = addon.sent_at
        ? formatTimeSince(new Date(addon.sent_at))
        : 'just now';

      const expiresFormatted = addon.expires_at
        ? formatPSTTime(new Date(addon.expires_at))
        : 'no expiration';

      const employeeName = addon.employee_name || 'our team';

      let section = `\nPENDING SERVICE AUTHORIZATION:
This customer has a pending add-on authorization for their current vehicle service visit.
- Add-on: ${name}
- Price: $${price.toFixed(2)}${addon.discount_amount > 0 ? ` ($${addon.discount_amount.toFixed(2)} off)` : ''}
- Proposed by: ${employeeName}
- Sent: ${timeSinceSent}
- Expires: ${expiresFormatted}
- Authorization ID: ${addon.id}

RULES:
- If the customer says yes, approve, go ahead, do it, sounds good, or similar affirmative → confirm you'll let the team know and output [AUTHORIZE_ADDON:${addon.id}]
- If the customer says no, decline, skip it, not today, or similar negative → acknowledge gracefully, mention they can get it done next visit, and output [DECLINE_ADDON:${addon.id}]
- If they ask questions about the service, timing, or price → answer from the context above. Be helpful and informative.
- You CANNOT negotiate price. If they push back on cost, empathize and suggest they call the shop to discuss options.
- If they ask "how long will it take?" → tell them the estimated additional time (${addon.pickup_delay_minutes} minutes).
- Only output the [AUTHORIZE_ADDON] or [DECLINE_ADDON] block ONCE per addon.`;

      sections.push(section);
    } else {
      // Recently resolved addon — tell AI not to re-process
      sections.push(
        `\nPREVIOUSLY RESOLVED ADD-ON:
- Add-on: ${name} was ${addon.status}. Do not output any authorization blocks for this.`
      );
    }
  }

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAddonName(addon: {
  custom_description: string | null;
  service?: { name: string } | null;
  product?: { name: string } | null;
}): string {
  const service = addon.service as { name: string } | null;
  const product = addon.product as { name: string } | null;
  return addon.custom_description || service?.name || product?.name || 'Service Add-on';
}

function getAddonNameFromContext(addon: AddonWithContext): string {
  return addon.custom_description || addon.service_name || addon.product_name || 'Service Add-on';
}

function formatTimeSince(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hour${hrs > 1 ? 's' : ''} ${mins % 60} min ago`;
}

function formatPSTTime(date: Date): string {
  return date.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
