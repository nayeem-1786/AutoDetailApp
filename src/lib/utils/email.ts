// Shared Mailgun email helper
// Extracted from src/app/api/pos/receipts/email/route.ts

interface EmailResult {
  success: true;
  id: string;
}

interface EmailError {
  success: false;
  error: string;
}

export type SendEmailResult = EmailResult | EmailError;

/**
 * Send an email via Mailgun.
 * Validates env vars and returns a typed result.
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<SendEmailResult> {
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const mailgunKey = process.env.MAILGUN_API_KEY;

  if (!mailgunDomain || !mailgunKey) {
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('from', `Smart Detail Auto Spa <noreply@${mailgunDomain}>`);
    formData.append('to', to);
    formData.append('subject', subject);
    formData.append('text', text);
    if (html) {
      formData.append('html', html);
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
