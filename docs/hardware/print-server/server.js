/**
 * Smart Details Print Server
 *
 * Minimal Node.js HTTP server that relays ESC/POS binary data to a
 * Star TSP100III receipt printer connected via USB on a Windows PC.
 *
 * Runs on the Optiplex at 192.168.1.174:8080.
 * The Next.js app sends ESC/POS binary to this server, which writes
 * it to the printer's USB port.
 */

const express = require('express');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 8080;

// Printer configuration
const PRINTER_NAME = 'Star TSP100 Cutter (TSP143)';
const PRINTER_PORT = 'USB003'; // Windows USB port — verify with: wmic printer get name,portname

// CORS — allow requests from any origin (the app runs on a different host)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Parse raw binary body for print endpoints
app.use('/print', express.raw({ type: 'application/octet-stream', limit: '1mb' }));
app.use('/cash-drawer', express.raw({ type: 'application/octet-stream', limit: '1mb' }));

/**
 * Write binary data to the printer.
 * Strategy: write to temp file, then use Windows `copy /b` to the printer port.
 */
function writeToPrinter(data) {
  const tmpFile = path.join(os.tmpdir(), `receipt-${Date.now()}.bin`);

  try {
    fs.writeFileSync(tmpFile, data);

    // Try direct port copy first (fastest, works when port is available)
    try {
      execSync(`copy /b "${tmpFile}" "${PRINTER_PORT}"`, {
        shell: 'cmd.exe',
        timeout: 5000,
        windowsHide: true,
      });
    } catch {
      // Fallback: use Windows print command via the printer share name
      // This routes through the Windows spooler
      try {
        execSync(`copy /b "${tmpFile}" "\\\\localhost\\${PRINTER_NAME}"`, {
          shell: 'cmd.exe',
          timeout: 5000,
          windowsHide: true,
        });
      } catch (e2) {
        throw new Error(`Failed to write to printer: ${e2.message}`);
      }
    }
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

/**
 * GET /health — Check if server is running
 */
app.get('/health', (req, res) => {
  log('Health check');
  res.json({
    status: 'ok',
    printer: PRINTER_NAME,
    port: PRINTER_PORT,
    uptime: Math.floor(process.uptime()),
  });
});

/**
 * POST /print — Receive raw ESC/POS binary, write to printer
 */
app.post('/print', (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.length) {
      log('Print request with no data');
      return res.status(400).json({ error: 'No data received' });
    }

    log(`Print job: ${data.length} bytes`);
    writeToPrinter(Buffer.from(data));
    log('Print job complete');
    res.json({ success: true, bytes: data.length });
  } catch (err) {
    log(`Print error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /test — Print a test receipt
 */
app.post('/test', (req, res) => {
  try {
    log('Test print requested');

    // Build a simple ESC/POS test receipt
    const parts = [];

    // Initialize
    parts.push(0x1B, 0x40);

    // Center align
    parts.push(0x1B, 0x1D, 0x61, 0x01);

    // Bold + double size
    parts.push(0x1B, 0x45, 0x01);
    parts.push(0x1B, 0x69, 0x01, 0x01);
    addText(parts, 'TEST RECEIPT');
    parts.push(0x0A);

    // Normal size
    parts.push(0x1B, 0x69, 0x00, 0x00);
    parts.push(0x1B, 0x45, 0x00);

    addText(parts, 'Smart Details Auto Spa');
    parts.push(0x0A);
    addText(parts, 'Print Server v1.0');
    parts.push(0x0A);

    // Left align
    parts.push(0x1B, 0x1D, 0x61, 0x00);
    addText(parts, '-'.repeat(48));
    parts.push(0x0A);

    const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    addText(parts, `Date: ${now}`);
    parts.push(0x0A);
    addText(parts, `Printer: ${PRINTER_NAME}`);
    parts.push(0x0A);
    addText(parts, `Port: ${PRINTER_PORT}`);
    parts.push(0x0A);

    addText(parts, '-'.repeat(48));
    parts.push(0x0A);

    // Center
    parts.push(0x1B, 0x1D, 0x61, 0x01);
    addText(parts, 'Connection OK!');
    parts.push(0x0A);

    // Feed + cut
    parts.push(0x0A, 0x0A, 0x0A);
    parts.push(0x1B, 0x64, 0x02);

    writeToPrinter(Buffer.from(parts));
    log('Test print complete');
    res.json({ success: true });
  } catch (err) {
    log(`Test print error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /cash-drawer — Send cash drawer kick command
 */
app.post('/cash-drawer', (req, res) => {
  try {
    log('Cash drawer kick');

    // ESC/POS cash drawer command: Initialize + kick pin 2
    const cmd = Buffer.from([
      0x1B, 0x40,                   // Initialize
      0x1B, 0x70, 0x00, 0x19, 0xFA, // Kick drawer pin 2
    ]);

    writeToPrinter(cmd);
    log('Cash drawer kicked');
    res.json({ success: true });
  } catch (err) {
    log(`Cash drawer error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helper: add ASCII text bytes to array
 */
function addText(arr, text) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    arr.push(code < 128 ? code : 0x3F);
  }
}

/**
 * Log with timestamp
 */
function log(msg) {
  const ts = new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour12: false,
  });
  console.log(`[${ts}] ${msg}`);
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  log(`Print server running on http://0.0.0.0:${PORT}`);
  log(`Printer: ${PRINTER_NAME} on port ${PRINTER_PORT}`);
  log('Endpoints:');
  log('  GET  /health       — Server status');
  log('  POST /print        — Print ESC/POS binary data');
  log('  POST /test         — Print test receipt');
  log('  POST /cash-drawer  — Kick cash drawer open');
});
