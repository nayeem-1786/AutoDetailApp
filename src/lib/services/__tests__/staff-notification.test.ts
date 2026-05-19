import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  STAFF_NOTIFICATION_REASONS,
  REASON_LABELS,
  isStaffNotificationReason,
  type StaffNotificationReason,
} from '@/lib/services/staff-notification';

interface MockTemplateResult {
  body: string;
  isActive: boolean;
  canSilence: boolean;
  recipientType: 'customer' | 'staff' | 'detailer';
  recipientPhones: string[] | null;
  skipped?: boolean;
  skipReason?: string;
  missingVars?: string[];
}

const sendSmsMock = vi.fn(async (_to: string, _body: string) => ({
  success: true as const,
  sid: 'mock-sid',
}));

const renderSmsTemplateMock = vi.fn<
  (slug: string, vars: Record<string, unknown>, fallback: string) => Promise<MockTemplateResult>
>(async () => ({
  body: 'rendered body',
  isActive: true,
  canSilence: true,
  recipientType: 'staff',
  recipientPhones: null,
}));

const getBusinessInfoMock = vi.fn(async () => ({
  name: 'Smart Details',
  phone: '+14242370913',
  address: '2021 Lomita Blvd, Lomita, CA 90717',
  streetAddress: '2021 Lomita Blvd',
  city: 'Lomita',
  state: 'CA',
  zip: '90717',
  email: null,
  website: null,
  logo_url: null,
}));

vi.mock('@/lib/utils/sms', () => ({
  sendSms: (...args: [string, string]) => sendSmsMock(...args),
}));

vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: (...args: [string, Record<string, unknown>, string]) =>
    renderSmsTemplateMock(...args),
}));

vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: () => getBusinessInfoMock(),
}));

const adminState = {
  conversation: null as { id: string } | null,
  messageInsertCalled: false,
  conversationUpdateCalled: false,
  /** Last payload passed to `messages.insert()` — captures channel value for assertions. */
  lastMessageInsert: null as Record<string, unknown> | null,
  /** Last payload passed to `conversations.update()` — captures last_channel value. */
  lastConversationUpdate: null as Record<string, unknown> | null,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'conversations') {
        const chain = {
          _action: undefined as 'select' | 'update' | undefined,
          select() { chain._action = 'select'; return chain; },
          eq() { return chain; },
          maybeSingle: async () => ({ data: adminState.conversation, error: null }),
          update(payload: Record<string, unknown>) {
            adminState.conversationUpdateCalled = true;
            adminState.lastConversationUpdate = payload;
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
        return chain;
      }
      if (table === 'messages') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            adminState.messageInsertCalled = true;
            adminState.lastMessageInsert = payload;
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { notifyStaff } from '@/lib/services/staff-notification';

beforeEach(() => {
  sendSmsMock.mockClear();
  sendSmsMock.mockImplementation(async () => ({ success: true as const, sid: 'mock-sid' }));
  renderSmsTemplateMock.mockClear();
  renderSmsTemplateMock.mockImplementation(async () => ({
    body: 'rendered body',
    isActive: true,
    canSilence: true,
    recipientType: 'staff',
    recipientPhones: null,
  }));
  getBusinessInfoMock.mockClear();
  adminState.conversation = null;
  adminState.messageInsertCalled = false;
  adminState.conversationUpdateCalled = false;
  adminState.lastMessageInsert = null;
  adminState.lastConversationUpdate = null;
});

describe('STAFF_NOTIFICATION_REASONS — 7 reason codes including human_handoff', () => {
  it('contains exactly 7 reasons', () => {
    expect(STAFF_NOTIFICATION_REASONS).toHaveLength(7);
  });

  it('includes human_handoff', () => {
    expect(STAFF_NOTIFICATION_REASONS).toContain('human_handoff' as StaffNotificationReason);
  });

  it('every reason has a non-empty label', () => {
    for (const reason of STAFF_NOTIFICATION_REASONS) {
      expect(REASON_LABELS[reason].length).toBeGreaterThan(0);
    }
  });

  it('isStaffNotificationReason recognizes all known reasons', () => {
    for (const reason of STAFF_NOTIFICATION_REASONS) {
      expect(isStaffNotificationReason(reason)).toBe(true);
    }
  });

  it('isStaffNotificationReason rejects unknown values', () => {
    expect(isStaffNotificationReason('not-a-reason')).toBe(false);
    expect(isStaffNotificationReason(undefined)).toBe(false);
    expect(isStaffNotificationReason(42)).toBe(false);
  });
});

describe('notifyStaff — happy path', () => {
  it('sends SMS to recipientPhones from template when set', async () => {
    renderSmsTemplateMock.mockImplementationOnce(async () => ({
      body: 'Staff alert body',
      isActive: true,
      canSilence: true,
      recipientType: 'staff',
      recipientPhones: ['+15551112222', '+15553334444'],
    }));
    const result = await notifyStaff({
      reason: 'custom_quote',
      customerName: 'Alice Anders',
      customerPhone: '+14245551234',
      details: 'Asking about ceramic for Ferrari',
      source: 'sms_ai_v2',
    });
    expect(result.success).toBe(true);
    expect(result.recipientsNotified).toBe(2);
    expect(result.errors).toEqual([]);
    expect(sendSmsMock).toHaveBeenCalledTimes(2);
    expect(sendSmsMock).toHaveBeenNthCalledWith(1, '+15551112222', 'Staff alert body');
    expect(sendSmsMock).toHaveBeenNthCalledWith(2, '+15553334444', 'Staff alert body');
  });

  it('falls back to business.phone when recipientPhones is null', async () => {
    renderSmsTemplateMock.mockImplementationOnce(async () => ({
      body: 'Staff alert body',
      isActive: true,
      canSilence: true,
      recipientType: 'staff',
      recipientPhones: null,
    }));
    const result = await notifyStaff({
      reason: 'transfer_request',
      customerName: 'Bob',
      customerPhone: '+14245551234',
      details: 'Wants to talk to a human',
      source: 'voice_agent',
    });
    expect(result.success).toBe(true);
    expect(result.recipientsNotified).toBe(1);
    expect(sendSmsMock).toHaveBeenCalledWith('+14242370913', 'Staff alert body');
  });

  it('passes reason_label matching REASON_LABELS to the template renderer', async () => {
    await notifyStaff({
      reason: 'human_handoff',
      customerName: 'Carol',
      customerPhone: '+14245551234',
      details: 'Frustrated',
      source: 'sms_ai_v2',
    });
    const [, vars] = renderSmsTemplateMock.mock.calls[0];
    expect(vars.reason_label).toBe(REASON_LABELS.human_handoff);
  });

  it('uses fallback body when template render returns empty body', async () => {
    renderSmsTemplateMock.mockImplementationOnce(async () => ({
      body: '',
      isActive: true,
      canSilence: true,
      recipientType: 'staff',
      recipientPhones: ['+15551112222'],
    }));
    await notifyStaff({
      reason: 'beyond_scope',
      customerName: 'Dave',
      customerPhone: '+14245551234',
      details: 'Asking about something obscure',
      source: 'sms_ai_v2',
    });
    const [, sentBody] = sendSmsMock.mock.calls[0];
    expect(sentBody).toContain('Staff Action Needed');
    expect(sentBody).toContain('Dave');
    expect(sentBody).toContain(REASON_LABELS.beyond_scope);
  });
});

describe('notifyStaff — template inactive', () => {
  it('returns success=true with templateInactive flag and zero recipients', async () => {
    renderSmsTemplateMock.mockImplementationOnce(async () => ({
      body: '',
      isActive: false,
      canSilence: true,
      recipientType: 'staff',
      recipientPhones: null,
    }));
    const result = await notifyStaff({
      reason: 'other',
      customerName: 'Eve',
      customerPhone: '+14245551234',
      details: 'noise',
      source: 'sms_ai_v2',
    });
    expect(result.success).toBe(true);
    expect(result.templateInactive).toBe(true);
    expect(result.recipientsNotified).toBe(0);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});

describe('notifyStaff — no recipients', () => {
  it('returns success=false with noRecipients flag when no template recipients and biz.phone is empty', async () => {
    renderSmsTemplateMock.mockImplementationOnce(async () => ({
      body: 'body',
      isActive: true,
      canSilence: true,
      recipientType: 'staff',
      recipientPhones: null,
    }));
    getBusinessInfoMock.mockImplementationOnce(async () => ({
      name: 'Smart Details',
      phone: '',
      address: 'addr',
      streetAddress: '',
      city: '',
      state: '',
      zip: '',
      email: null,
      website: null,
      logo_url: null,
    }));
    const result = await notifyStaff({
      reason: 'other',
      customerName: 'Frank',
      customerPhone: '+14245551234',
      details: 'noise',
      source: 'sms_ai_v2',
    });
    expect(result.success).toBe(false);
    expect(result.noRecipients).toBe(true);
    expect(result.errors).toEqual(['no_recipient_phones']);
  });
});

describe('notifyStaff — partial failure', () => {
  it('reports per-recipient errors and returns success=false when any send fails', async () => {
    renderSmsTemplateMock.mockImplementationOnce(async () => ({
      body: 'body',
      isActive: true,
      canSilence: true,
      recipientType: 'staff',
      recipientPhones: ['+15551112222', '+15553334444'],
    }));
    sendSmsMock.mockImplementationOnce(async () => ({ success: true as const, sid: 'sid-1' }));
    sendSmsMock.mockImplementationOnce(async () => ({
      success: false as const,
      error: 'Twilio 30034',
    }));
    const result = await notifyStaff({
      reason: 'other',
      customerName: 'Grace',
      customerPhone: '+14245551234',
      details: 'detail',
      source: 'sms_ai_v2',
    });
    expect(result.success).toBe(false);
    expect(result.recipientsNotified).toBe(1);
    expect(result.errors).toEqual(['+15553334444: Twilio 30034']);
  });
});

describe('notifyStaff — audit log to customer thread', () => {
  it('writes a system message + updates conversation when conversation exists', async () => {
    adminState.conversation = { id: 'conv-1' };
    renderSmsTemplateMock.mockImplementationOnce(async () => ({
      body: 'body',
      isActive: true,
      canSilence: true,
      recipientType: 'staff',
      recipientPhones: ['+15551112222'],
    }));
    await notifyStaff({
      reason: 'custom_quote',
      customerName: 'Heidi',
      customerPhone: '+14245551234',
      details: 'spec details',
      source: 'sms_ai_v2',
    });
    expect(adminState.messageInsertCalled).toBe(true);
    expect(adminState.conversationUpdateCalled).toBe(true);
  });

  it('skips audit log when no conversation exists for the phone', async () => {
    adminState.conversation = null;
    await notifyStaff({
      reason: 'custom_quote',
      customerName: 'Ivan',
      customerPhone: '+14245551234',
      details: 'spec',
      source: 'sms_ai_v2',
    });
    expect(adminState.messageInsertCalled).toBe(false);
    expect(adminState.conversationUpdateCalled).toBe(false);
  });

  it('skips audit log when customerPhone is unparseable', async () => {
    adminState.conversation = { id: 'conv-1' }; // would be returned if asked
    await notifyStaff({
      reason: 'other',
      customerName: 'Jude',
      customerPhone: '',
      details: 'noise',
      source: 'voice_agent',
    });
    expect(adminState.messageInsertCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Layer 1+2 fixup — version-free channel attribution
// ---------------------------------------------------------------------------

describe('notifyStaff — audit log channel attribution (fixup)', () => {
  beforeEach(() => {
    adminState.conversation = { id: 'conv-1' };
    renderSmsTemplateMock.mockImplementation(async () => ({
      body: 'body',
      isActive: true,
      canSilence: true,
      recipientType: 'staff',
      recipientPhones: ['+15551112222'],
    }));
  });

  it('source=voice_agent → messages.insert receives channel="voice"', async () => {
    await notifyStaff({
      reason: 'custom_quote',
      customerName: 'Kai',
      customerPhone: '+14245551234',
      details: 'voice path',
      source: 'voice_agent',
    });
    expect(adminState.lastMessageInsert?.channel).toBe('voice');
  });

  it('source=voice_agent → conversations.update receives last_channel="voice"', async () => {
    await notifyStaff({
      reason: 'custom_quote',
      customerName: 'Lara',
      customerPhone: '+14245551234',
      details: 'voice path',
      source: 'voice_agent',
    });
    expect(adminState.lastConversationUpdate?.last_channel).toBe('voice');
  });

  it('source=sms_ai_v2 → messages.insert receives channel="sms_ai" (version-free)', async () => {
    await notifyStaff({
      reason: 'custom_quote',
      customerName: 'Mei',
      customerPhone: '+14245551234',
      details: 'sms path',
      source: 'sms_ai_v2',
    });
    expect(adminState.lastMessageInsert?.channel).toBe('sms_ai');
    // Persistent column value must not embed the agent-runtime version.
    expect(adminState.lastMessageInsert?.channel).not.toBe('sms_ai_v2');
  });

  it('source=sms_ai_v2 → conversations.update receives last_channel="sms_ai" (version-free)', async () => {
    await notifyStaff({
      reason: 'custom_quote',
      customerName: 'Nico',
      customerPhone: '+14245551234',
      details: 'sms path',
      source: 'sms_ai_v2',
    });
    expect(adminState.lastConversationUpdate?.last_channel).toBe('sms_ai');
    expect(adminState.lastConversationUpdate?.last_channel).not.toBe('sms_ai_v2');
  });

  it('insert payload retains sender_type=system regardless of source', async () => {
    await notifyStaff({
      reason: 'other',
      customerName: 'Omar',
      customerPhone: '+14245551234',
      details: 'd',
      source: 'sms_ai_v2',
    });
    expect(adminState.lastMessageInsert?.sender_type).toBe('system');
    expect(adminState.lastMessageInsert?.direction).toBe('outbound');
  });
});
