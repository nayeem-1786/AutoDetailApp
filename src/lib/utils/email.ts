// Shared Mailgun email helper
// Extracted from src/app/api/pos/receipts/email/route.ts

import { getBusinessInfo } from '@/lib/data/business';

interface EmailResult {
  success: true;
  id: string;
}

interface EmailError {
  success: false;
  error: string;
}

export type SendEmailResult = EmailResult | EmailError;

interface SendEmailOptions {
  variables?: Record<string, string>;  // Mailgun custom vars (v:key)
  tracking?: boolean;                  // Enable open/click tracking
}

/**
 * Send an email via Mailgun.
 * Validates env vars and returns a typed result.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
  options?: SendEmailOptions
): Promise<SendEmailResult> {
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const mailgunKey = process.env.MAILGUN_API_KEY;

  if (!mailgunDomain || !mailgunKey) {
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const businessInfo = await getBusinessInfo();
    const formData = new URLSearchParams();
    formData.append('from', `${businessInfo.name} <noreply@${mailgunDomain}>`);
    formData.append('to', to);
    formData.append('subject', subject);
    formData.append('text', text);
    if (html) {
      formData.append('html', html);
    }

    if (options?.variables) {
      for (const [key, value] of Object.entries(options.variables)) {
        formData.append(`v:${key}`, value);
      }
    }

    if (options?.tracking) {
      formData.append('o:tracking-opens', 'yes');
      formData.append('o:tracking-clicks', 'yes');
    }

    const res = await fetch(
      `https://api.mailgun.net/v3/${mailgunDomain}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`api:${mailgunKey}`)}`,
        },
        body: formData,
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('Mailgun error:', errText);
      return { success: false, error: 'Failed to send email' };
    }

    const data = await res.json();
    return { success: true, id: data.id };
  } catch (err) {
    console.error('Email send error:', err);
    return { success: false, error: 'Email send failed' };
  }
}
