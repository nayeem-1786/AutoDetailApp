import cron from 'node-cron';

const CRON_API_KEY = process.env.CRON_API_KEY;
// Use localhost — cron runs inside the Next.js process, no need for external round-trip
const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

let initialized = false;

async function callCronEndpoint(path: string, name: string, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`[CRON] Running ${name}...${attempt > 0 ? ` (retry ${attempt})` : ''}`);
      const response = await fetch(`${BASE_URL}${path}`, {
        method: 'GET',
        headers: { 'x-api-key': CRON_API_KEY || '' },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        console.error(`[CRON] ${name} returned ${response.status}`);
        return;
      }

      const data = await response.json().catch(() => null);
      console.log(`[CRON] ${name} completed:`, data?.message || 'OK');
      return;
    } catch (err: any) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        console.error(`[CRON] ${name} failed after ${retries + 1} attempts:`, err.message || err);
      } else {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
}

export function setupCronJobs() {
  if (initialized) return;
  initialized = true;

  console.log('[CRON] Initializing internal cron scheduler...');

  // Lifecycle engine — every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    callCronEndpoint('/api/cron/lifecycle-engine', 'lifecycle-engine');
  });

  // Quote reminders — every hour at :30
  cron.schedule('30 * * * *', () => {
    callCronEndpoint('/api/cron/quote-reminders', 'quote-reminders');
  });

  // Stock alerts — daily at 8:00 AM PST (16:00 UTC)
  cron.schedule('0 16 * * *', () => {
    callCronEndpoint('/api/cron/stock-alerts', 'stock-alerts');
  });

  // QBO auto-sync — every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    callCronEndpoint('/api/cron/qbo-sync', 'qbo-sync');
  });

  // Theme auto-activation — every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    callCronEndpoint('/api/cron/theme-activation', 'theme-activation');
  });

  // Google reviews refresh — daily at 6:00 AM PST (14:00 UTC)
  cron.schedule('0 14 * * *', () => {
    callCronEndpoint('/api/cron/google-reviews', 'google-reviews');
  });

  // Abandoned order cleanup — every 6 hours
  cron.schedule('0 */6 * * *', () => {
    callCronEndpoint('/api/cron/cleanup-orders', 'cleanup-orders');
  });

  // Idempotency key cleanup — daily at 3 AM PST (11:00 UTC)
  cron.schedule('0 11 * * *', () => {
    callCronEndpoint('/api/cron/cleanup-idempotency', 'cleanup-idempotency');
  });

  // Audit log retention cleanup — daily at 3:30 AM PST (11:30 UTC)
  cron.schedule('30 11 * * *', () => {
    callCronEndpoint('/api/cron/cleanup-audit-log', 'cleanup-audit-log');
  });

  console.log('[CRON] Scheduled jobs:');
  console.log('  - lifecycle-engine: every 10 minutes');
  console.log('  - quote-reminders: every hour at :30');
  console.log('  - stock-alerts: daily at 8:00 AM PST');
  console.log('  - qbo-sync: every 30 minutes');
  console.log('  - theme-activation: every 15 minutes');
  console.log('  - google-reviews: daily at 6:00 AM PST');
  console.log('  - cleanup-orders: every 6 hours');
  console.log('  - cleanup-idempotency: daily at 3:00 AM PST');
  console.log('  - cleanup-audit-log: daily at 3:30 AM PST');
}
