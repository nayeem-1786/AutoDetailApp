/**
 * Phase Messaging-1+2 follow-up — shared comm-history pill state machine.
 *
 * Used by both POS (`quote-detail.tsx`) and admin (`admin/quotes/[id]/page.tsx`)
 * to keep the pill semantics identical across the two surfaces. Each caller
 * maps `tone` to its own class palette.
 *
 * Twilio status lifecycle (per Twilio docs):
 *   queued / accepted → sending → sent → delivered
 *                                       ↘ undelivered / failed
 *
 * Important: `sent` is the TERMINAL state for many real-world scenarios —
 * Twilio test numbers, carriers that don't return delivery receipts, MMS in
 * some networks. We treat `sent` AS A SUCCESS (green), not as in-flight.
 * Previously we showed yellow "Sending…" for `sent` and the pill could be
 * stuck there indefinitely.
 */

export type CommPillTone = 'green' | 'yellow' | 'red' | 'orange';

export interface CommPillState {
  tone: CommPillTone;
  label: string;
  /** Optional secondary line — usually the Twilio error code or qc.error_message. */
  detail: string | null;
}

export interface CommPillInput {
  channel: 'email' | 'sms';
  /** Send-time outcome written by send-service: 'sent' | 'failed' | 'blocked'. */
  status: 'sent' | 'failed' | 'blocked';
  error_message: string | null;
  twilio_sid: string | null;
  /** Latest Twilio webhook status from sms_delivery_log (null when unjoined). */
  delivery_status: string | null;
  /** Twilio error code from sms_delivery_log when present. */
  delivery_error_code: string | null;
}

export function deriveCommPillState(comm: CommPillInput): CommPillState {
  // Pre-flight gates (blocked) and infrastructure failures (failed) at send
  // time always win — they're not waiting on Twilio.
  if (comm.status === 'failed') {
    return { tone: 'red', label: 'Failed', detail: comm.error_message };
  }
  if (comm.status === 'blocked') {
    return { tone: 'orange', label: 'Blocked', detail: comm.error_message };
  }

  // SMS rows with a captured SID get the Twilio overlay. Rows without a SID
  // (email, legacy pre-Phase-Messaging-2 SMS) fall through to plain "Sent".
  if (comm.channel === 'sms' && comm.twilio_sid) {
    if (comm.delivery_status !== null) {
      switch (comm.delivery_status) {
        case 'delivered':
          return { tone: 'green', label: 'Delivered', detail: null };
        case 'sent':
          // Twilio handed off to the carrier. For test numbers and many
          // real-world MMS/SMS paths this is the terminal success state.
          return { tone: 'green', label: 'Sent', detail: null };
        case 'queued':
        case 'accepted':
        case 'sending':
          return { tone: 'yellow', label: 'Sending…', detail: null };
        case 'undelivered':
          return {
            tone: 'red',
            label: 'Undelivered',
            detail: comm.delivery_error_code ? `Twilio ${comm.delivery_error_code}` : null,
          };
        case 'failed':
          return {
            tone: 'red',
            label: 'Failed',
            detail: comm.delivery_error_code ? `Twilio ${comm.delivery_error_code}` : null,
          };
        default:
          // Unknown Twilio status — show what Twilio gave us rather than
          // burying the signal.
          return { tone: 'yellow', label: comm.delivery_status, detail: null };
      }
    }

    // SID captured but no sms_delivery_log row yet. Two real causes:
    //  1. Webhook hasn't arrived yet (race between send and webhook write)
    //  2. Legacy pre-Phase-Messaging-2 SMS that has a SID from `messages`
    //     but no sms_delivery_log row was ever inserted
    // For either, the send-time status is the best signal we have. Show
    // optimistic green "Sent" rather than perpetual yellow "Pending".
    return { tone: 'green', label: 'Sent', detail: null };
  }

  // Email row OR SMS row without a SID — plain send-time status governs.
  return { tone: 'green', label: 'Sent', detail: null };
}
