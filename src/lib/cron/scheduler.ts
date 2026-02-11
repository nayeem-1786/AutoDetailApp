import cron from 'node-cron';

const CRON_API_KEY = process.env.CRON_API_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

let initialized = false;

async function callCronEndpoint(path: string, name: string) {
  try {
    console.log(`[CRON] Running ${name}...`);
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers: { 'x-api-key': CRON_API_KEY || '' },
    });
    const data = await response.json();
    console.log(`[CRON] ${name} completed:`, JSON.stringify(data));
  } catch (error) {
    console.error(`[CRON] ${name} failed:`, error);
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

  console.log('[CRON] Scheduled jobs:');
  console.log('  - lifecycle-engine: every 10 minutes');
  console.log('  - quote-reminders: every hour at :30');
  console.log('  - stock-alerts: daily at 8:00 AM PST');
}
