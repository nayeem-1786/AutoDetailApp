import { sendTemplatedEmail } from './send-templated-email';

export async function sendWelcomeEmail(customer: {
  email: string;
  first_name: string;
  last_name?: string | null;
}) {
  if (!customer.email) return;

  try {
    await sendTemplatedEmail(customer.email, 'welcome_email', {
      first_name: customer.first_name,
      last_name: customer.last_name || '',
      customer_name: `${customer.first_name} ${customer.last_name || ''}`.trim(),
    });
  } catch (e) {
    console.error('Failed to send welcome email:', e);
  }
}
