import cron from 'node-cron';

const CRON_API_KEY = process.env.CRON_API_KEY;

function getBaseUrl(): string {
  return process.env.CRON_BASE_URL
    || `http://localhost:${process.env.PORT || 3000}`;
}

const CRON_KEY = '__smartdetails_cron_initialized__';
const RUNNING_JOBS_KEY = '__smartdetails_cron_running__';

const PROCESS_START_TIME = Date.now();
const STARTUP_GRACE_MS = 60_000;

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
      const response = await fetch(`${getBaseUrl()}${path}`, {
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
    } catch (err: unknown) {
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
  if (Date.now() - PROCESS_START_TIME < STARTUP_GRACE_MS) {
    console.log(`[CRON] Skipping ${name} — startup grace window`);
    return;
  }

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
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[CRON] Failed ${name} after ${duration}ms:`, message);
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
  console.log('[CRON] BASE_URL:', getBaseUrl());

  const tasks: { name: string; expr: string; fn: () => void; timeoutMs?: number }[] = [
    { name: 'lifecycle-engine', expr: '*/10 * * * *', fn: () => runJob('lifecycle-engine', '/api/cron/lifecycle-engine') },
    { name: 'quote-reminders', expr: '30 * * * *', fn: () => runJob('quote-reminders', '/api/cron/quote-reminders') },
    { name: 'stock-alerts', expr: '0 16 * * *', fn: () => runJob('stock-alerts', '/api/cron/stock-alerts') },
    { name: 'qbo-sync', expr: '*/30 * * * *', fn: () => runJob('qbo-sync', '/api/cron/qbo-sync', 15 * 60 * 1000) },
    { name: 'theme-activation', expr: '*/15 * * * *', fn: () => runJob('theme-activation', '/api/cron/theme-activation') },
    { name: 'google-reviews', expr: '0 14 * * *', fn: () => runJob('google-reviews', '/api/cron/google-reviews') },
    { name: 'cleanup-orders', expr: '0 */6 * * *', fn: () => runJob('cleanup-orders', '/api/cron/cleanup-orders') },
    { name: 'cleanup-idempotency', expr: '0 11 * * *', fn: () => runJob('cleanup-idempotency', '/api/cron/cleanup-idempotency') },
    { name: 'cleanup-audit-log', expr: '30 11 * * *', fn: () => runJob('cleanup-audit-log', '/api/cron/cleanup-audit-log') },
  ];

  // Stagger task starts 2s apart to avoid aligned schedule bursts
  tasks.forEach(({ expr, fn, name }, i) => {
    setTimeout(() => {
      cron.schedule(expr, fn);
      console.log(`[CRON] Started ${name}`);
    }, i * 2000);
  });

  console.log(`[CRON] Registered ${tasks.length} jobs (staggered start, 2s apart):`);
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
