import cron from 'node-cron';

const CRON_API_KEY = process.env.CRON_API_KEY;
// Use localhost — cron runs inside the Next.js process, no need for external round-trip
const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

const CRON_KEY = '__smartdetails_cron_initialized__';
const RUNNING_JOBS_KEY = '__smartdetails_cron_running__';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRunningJobs(): Set<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(globalThis as any)[RUNNING_JOBS_KEY]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any)[RUNNING_JOBS_KEY] = new Set<string>();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any)[RUNNING_JOBS_KEY];
}

async function callCronEndpoint(
  path: string,
  name: string,
  retries = 1,
  timeoutMs = 30000
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[CRON] Retrying ${name} (attempt ${attempt + 1})...`);
      }
      const response = await fetch(`${BASE_URL}${path}`, {
        method: 'GET',
        headers: { 'x-api-key': CRON_API_KEY || '' },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        console.error(`[CRON] ${name} returned ${response.status}`);
        return;
      }

      await response.json().catch(() => null);
      return;
    } catch (err: any) {
      const isLastAttempt = attempt === retries;
      if (!isLastAttempt) {
        await new Promise((r) => setTimeout(r, 5000));
      } else {
        throw err;
      }
    }
  }
}

async function runJob(
  name: string,
  endpoint: string,
  timeoutMs?: number
) {
  const runningJobs = getRunningJobs();

  if (runningJobs.has(name)) {
    console.log(`[CRON] Skipping ${name} — previous run still in progress`);
    return;
  }

  runningJobs.add(name);
  const start = Date.now();
  console.log(`[CRON] Starting ${name}`);

  try {
    await callCronEndpoint(endpoint, name, 1, timeoutMs);
    const duration = Date.now() - start;
    console.log(`[CRON] Completed ${name} in ${duration}ms`);
  } catch (err: any) {
    const duration = Date.now() - start;
    console.error(`[CRON] Failed ${name} after ${duration}ms:`, err.message || err);
  } finally {
    runningJobs.delete(name);
  }
}

export function setupCronJobs() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((globalThis as any)[CRON_KEY]) {
    console.log('[CRON] Already initialized, skipping duplicate registration');
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any)[CRON_KEY] = true;

  console.log('[CRON] Initializing internal cron scheduler...');

  // Lifecycle engine — every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    runJob('lifecycle-engine', '/api/cron/lifecycle-engine');
  }, { scheduled: true, catchUp: false });

  // Quote reminders — every hour at :30
  cron.schedule('30 * * * *', () => {
    runJob('quote-reminders', '/api/cron/quote-reminders');
  }, { scheduled: true, catchUp: false });

  // Stock alerts — daily at 8:00 AM PST (16:00 UTC)
  cron.schedule('0 16 * * *', () => {
    runJob('stock-alerts', '/api/cron/stock-alerts');
  }, { scheduled: true, catchUp: false });

  // QBO auto-sync — every 30 minutes (15-min timeout for long syncs)
  cron.schedule('*/30 * * * *', () => {
    runJob('qbo-sync', '/api/cron/qbo-sync', 15 * 60 * 1000);
  }, { scheduled: true, catchUp: false });

  // Theme auto-activation — every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    runJob('theme-activation', '/api/cron/theme-activation');
  }, { scheduled: true, catchUp: false });

  // Google reviews refresh — daily at 6:00 AM PST (14:00 UTC)
  cron.schedule('0 14 * * *', () => {
    runJob('google-reviews', '/api/cron/google-reviews');
  }, { scheduled: true, catchUp: false });

  // Abandoned order cleanup — every 6 hours
  cron.schedule('0 */6 * * *', () => {
    runJob('cleanup-orders', '/api/cron/cleanup-orders');
  }, { scheduled: true, catchUp: false });

  // Idempotency key cleanup — daily at 3 AM PST (11:00 UTC)
  cron.schedule('0 11 * * *', () => {
    runJob('cleanup-idempotency', '/api/cron/cleanup-idempotency');
  }, { scheduled: true, catchUp: false });

  // Audit log retention cleanup — daily at 3:30 AM PST (11:30 UTC)
  cron.schedule('30 11 * * *', () => {
    runJob('cleanup-audit-log', '/api/cron/cleanup-audit-log');
  }, { scheduled: true, catchUp: false });

  const jobCount = 9;
  console.log(`[CRON] Registered ${jobCount} jobs:`);
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
