import { createAdminClient } from '@/lib/supabase/admin';
import type { AuditAction, AuditEntityType, AuditSource } from '@/lib/supabase/types';

export interface LogAuditParams {
  userId?: string | null;
  userEmail?: string | null;
  employeeName?: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  source?: AuditSource;
}

/**
 * Log an audit trail entry. Fire-and-forget — never throws.
 * Call AFTER the primary operation succeeds. Do NOT await in the critical path.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const adminDb = createAdminClient();
    await adminDb.from('audit_log').insert({
      user_id: params.userId || null,
      user_email: params.userEmail || null,
      employee_name: params.employeeName || null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      entity_label: params.entityLabel || null,
      details: params.details || null,
      ip_address: params.ipAddress || null,
      source: params.source || 'admin',
    });
  } catch (err) {
    console.error('[audit] Failed to log:', err, params);
  }
}

/** Extract IP address from request headers. */
export function getRequestIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || null;
}

/**
 * Build a before/after diff. Only includes fields that actually changed.
 * Keep details lean — pass only the fields you care about via fieldsToTrack.
 */
export function buildChangeDetails(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fieldsToTrack?: string[]
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = fieldsToTrack || Object.keys(after);

  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { from: before[key], to: after[key] };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}
