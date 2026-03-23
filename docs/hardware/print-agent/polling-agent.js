/**
 * Print Job Polling Agent — runs on the OptiPlex alongside the existing print server.
 *
 * Polls Supabase every 2 seconds for pending print jobs, sends binary data
 * to the local Express print server (localhost:8080), and marks jobs complete/failed.
 *
 * Setup:
 *   1. npm install @supabase/supabase-js
 *   2. Set environment variables (see .env.example or README.md)
 *   3. pm2 start polling-agent.js --name print-agent
 *   4. pm2 save
 *
 * Dependencies: @supabase/supabase-js (only)
 * Requires: print-server running on localhost:8080
 */

const { createClient } = require('@supabase/supabase-js');

// ── Configuration ────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRINT_SERVER_URL = process.env.PRINT_SERVER_URL || 'http://localhost:8080';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '2000', 10);
const STALE_JOB_TIMEOUT_S = parseInt(process.env.STALE_JOB_TIMEOUT_S || '60', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[PRINT-AGENT] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let isProcessing = false;

// ── Main polling loop ────────────────────────────────────────────────────────

async function pollForJobs() {
  if (isProcessing) return; // Skip if previous cycle is still running
  isProcessing = true;

  try {
    // Fetch up to 5 pending jobs, oldest first
    const { data: jobs, error } = await supabase
      .from('print_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error) {
      console.error('[PRINT-AGENT] Supabase query failed:', error.message);
      return;
    }

    if (!jobs || jobs.length === 0) return;

    for (const job of jobs) {
      await processJob(job);
    }
  } catch (err) {
    console.error('[PRINT-AGENT] Poll cycle error:', err.message || err);
  } finally {
    isProcessing = false;
  }
}

async function processJob(job) {
  const { id, type, payload, created_at } = job;

  // Check for stale jobs (pending too long — print server was probably down)
  const ageSeconds = (Date.now() - new Date(created_at).getTime()) / 1000;
  if (ageSeconds > STALE_JOB_TIMEOUT_S) {
    await markFailed(id, `Stale job — pending for ${Math.round(ageSeconds)}s (timeout: ${STALE_JOB_TIMEOUT_S}s)`);
    return;
  }

  // Mark as processing
  await supabase
    .from('print_jobs')
    .update({ status: 'processing', processing_at: new Date().toISOString() })
    .eq('id', id);

  // Decode base64 payload to binary
  const binaryData = payload ? Buffer.from(payload, 'base64') : Buffer.alloc(0);

  // Determine endpoint based on job type
  const endpoint = type === 'cash_drawer' ? '/cash-drawer' : '/print';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${PRINT_SERVER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: binaryData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      await markFailed(id, `Print server returned ${res.status}: ${errText}`);
      return;
    }

    // Success
    await supabase
      .from('print_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id);

    console.log(`[PRINT-AGENT] ✓ ${type} job ${id.slice(0, 8)} completed`);
  } catch (err) {
    const msg = err.name === 'AbortError'
      ? 'Print server timeout (5s)'
      : `Print server unreachable: ${err.message || err}`;
    await markFailed(id, msg);
  }
}

async function markFailed(id, errorMessage) {
  await supabase
    .from('print_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id);

  console.error(`[PRINT-AGENT] ✗ Job ${id.slice(0, 8)} failed: ${errorMessage}`);
}

// ── Startup ──────────────────────────────────────────────────────────────────

console.log('[PRINT-AGENT] Starting print job polling agent');
console.log(`[PRINT-AGENT] Supabase: ${SUPABASE_URL}`);
console.log(`[PRINT-AGENT] Print server: ${PRINT_SERVER_URL}`);
console.log(`[PRINT-AGENT] Poll interval: ${POLL_INTERVAL_MS}ms`);
console.log(`[PRINT-AGENT] Stale timeout: ${STALE_JOB_TIMEOUT_S}s`);

// Poll immediately, then on interval
pollForJobs();
setInterval(pollForJobs, POLL_INTERVAL_MS);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[PRINT-AGENT] Shutting down...');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[PRINT-AGENT] Shutting down...');
  process.exit(0);
});
