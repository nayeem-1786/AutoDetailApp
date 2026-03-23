# Print Job Polling Agent

Runs on the **OptiPlex** (same machine as the print server). Polls Supabase for pending print jobs and sends them to the local Express print server.

## Why

The app runs on a remote VPS that cannot reach the store's LAN. The VPS inserts print jobs into Supabase; this agent picks them up and delivers to the local printer.

## Setup

```bash
# On the OptiPlex, in the print-agent directory:
npm install @supabase/supabase-js

# Create .env file:
SUPABASE_URL=https://zwvahzymzardmxixyfim.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
PRINT_SERVER_URL=http://localhost:8080
POLL_INTERVAL_MS=2000
STALE_JOB_TIMEOUT_S=60

# Start with PM2:
pm2 start polling-agent.js --name print-agent
pm2 save
```

## How It Works

1. Polls `print_jobs` table every 2 seconds for `status = 'pending'`
2. For each job:
   - Marks `status = 'processing'`
   - Decodes base64 payload → binary ESC/POS data
   - POSTs to `localhost:8080/print` (receipt) or `localhost:8080/cash-drawer` (drawer kick)
   - Marks `status = 'completed'` or `status = 'failed'` with error message
3. Stale jobs (pending > 60s) are auto-failed

## Job Types

| Type | Payload | Print Server Endpoint |
|------|---------|----------------------|
| `thermal_receipt` | base64 ESC/POS binary (2-8KB) | `/print` |
| `cash_drawer` | base64 ESC/POS drawer kick (5 bytes) | `/cash-drawer` |

## Monitoring

```bash
pm2 logs print-agent        # Live logs
pm2 status                  # Check running state
pm2 restart print-agent     # Restart after changes
```

Logs show `✓` for completed jobs and `✗` for failures with error details.
