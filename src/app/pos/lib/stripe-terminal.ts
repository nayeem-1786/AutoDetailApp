import { loadStripeTerminal } from '@stripe/terminal-js';
import type {
  Terminal,
  Reader,
  ISdkManagedPaymentIntent,
  IPaymentIntent,
  ITipConfiguration,
  ICollectConfig,
} from '@stripe/terminal-js';
import { posFetch } from './pos-fetch';

type TerminalInstance = Terminal;

let terminal: TerminalInstance | null = null;
let connectedReader: Reader | null = null;
let connectionPromise: Promise<Reader> | null = null;
let initPromise: Promise<TerminalInstance> | null = null;
let collectInProgress = false;
let cancelRequested = false;

async function fetchConnectionToken(): Promise<string> {
  console.log('[Terminal] Fetching new connection token...');
  const res = await posFetch('/api/pos/stripe/connection-token', {
    method: 'POST',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to get connection token');
  console.log('[Terminal] Connection token obtained');
  return json.secret;
}

/**
 * Initialize or return the existing Stripe Terminal instance.
 * Singleton — only one terminal instance per browser session.
 */
export async function getTerminal(): Promise<TerminalInstance> {
  // Return existing terminal if available
  if (terminal) return terminal;

  // If initialization is in progress, wait for it
  if (initPromise) return initPromise;

  // Start initialization
  initPromise = (async () => {
    console.log('[Terminal] Initializing Stripe Terminal SDK...');
    const StripeTerminal = await loadStripeTerminal();
    if (!StripeTerminal) {
      throw new Error('Failed to load Stripe Terminal SDK');
    }

    terminal = StripeTerminal.create({
      onFetchConnectionToken: fetchConnectionToken,
      onUnexpectedReaderDisconnect: () => {
        console.warn('[Terminal] Reader disconnected unexpectedly');
        connectedReader = null;
        connectionPromise = null;
      },
    });

    console.log('[Terminal] SDK initialized');
    return terminal;
  })();

  return initPromise;
}

/**
 * Discover available readers (simulated or real).
 */
export async function discoverReaders(
  simulated = false,
  location?: string
): Promise<Reader[]> {
  const t = await getTerminal();

  console.log('[Terminal] Discovering readers...');
  const config: { simulated: boolean; location?: string } = { simulated };
  if (location) {
    config.location = location;
  }

  const result = await t.discoverReaders(config);

  if ('error' in result) {
    console.error('[Terminal] Discovery error:', result.error.message);
    throw new Error(result.error.message);
  }

  console.log('[Terminal] Found', result.discoveredReaders.length, 'reader(s)');
  return result.discoveredReaders;
}

/**
 * Connect to a reader. Prevents concurrent connection attempts.
 */
export async function connectReader(reader: Reader): Promise<Reader> {
  // If already connected to this reader, return it
  if (connectedReader?.id === reader.id) {
    console.log('[Terminal] Already connected to', reader.label || reader.id);
    return connectedReader;
  }

  // If a connection is in progress, wait for it
  if (connectionPromise) {
    console.log('[Terminal] Connection already in progress, waiting...');
    return connectionPromise;
  }

  // Start new connection
  connectionPromise = (async () => {
    const t = await getTerminal();

    console.log('[Terminal] Connecting to reader:', reader.label || reader.id);
    const result = await t.connectReader(reader);

    if ('error' in result) {
      console.error('[Terminal] Connection error:', result.error.message);
      connectionPromise = null;
      throw new Error(result.error.message);
    }

    connectedReader = result.reader;
    console.log('[Terminal] Connected successfully to', result.reader.label || result.reader.id);
    return result.reader;
  })();

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

/**
 * Ensure a reader is connected. Discovers and connects if needed.
 * This is the main entry point for ensuring connectivity.
 */
export async function ensureConnected(): Promise<Reader> {
  // Check if already connected
  if (await isReaderConnected()) {
    console.log('[Terminal] Already connected');
    return connectedReader!;
  }

  // Discover and connect
  const readers = await discoverReaders(false);
  if (readers.length === 0) {
    throw new Error('No card reader found. Please check that your reader is powered on and connected to WiFi.');
  }

  return connectReader(readers[0]);
}

/**
 * Get currently connected reader, if any.
 */
export function getConnectedReader(): Reader | null {
  return connectedReader;
}

/**
 * Check if terminal is connected to a reader.
 */
export async function isReaderConnected(): Promise<boolean> {
  if (!terminal) return false;
  const status = terminal.getConnectionStatus();
  const connected = status === 'connected';
  console.log('[Terminal] Connection status:', status);
  return connected;
}

/**
 * Check if a collect operation is currently in progress.
 */
export function isCollectInProgress(): boolean {
  return collectInProgress;
}

/**
 * Collect payment method on a PaymentIntent via the terminal reader.
 * Prevents concurrent collect operations.
 */
export async function collectPaymentMethod(
  clientSecret: string,
  options?: {
    tip_configuration?: ITipConfiguration;
    config_override?: ICollectConfig;
  }
): Promise<ISdkManagedPaymentIntent> {
  // Check if already collecting
  if (collectInProgress) {
    console.log('[Terminal] Collect already in progress, cancelling first...');
    await cancelCollect();
    // Wait a moment for the SDK to clean up
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Ensure connected before collecting
  await ensureConnected();

  const t = await getTerminal();

  collectInProgress = true;
  cancelRequested = false;

  console.log('[Terminal] Collecting payment method...');

  try {
    const result = await t.collectPaymentMethod(clientSecret, options);

    if ('error' in result) {
      console.error('[Terminal] Collect error:', result.error.message);
      throw new Error(result.error.message);
    }

    console.log('[Terminal] Payment method collected');
    return result.paymentIntent;
  } finally {
    collectInProgress = false;
  }
}

/**
 * Process the payment after collecting card info.
 */
export async function processPayment(
  paymentIntent: ISdkManagedPaymentIntent
): Promise<IPaymentIntent> {
  const t = await getTerminal();
  console.log('[Terminal] Processing payment...');
  const result = await t.processPayment(paymentIntent);

  if ('error' in result) {
    console.error('[Terminal] Process error:', result.error.message);
    throw new Error(result.error.message);
  }

  console.log('[Terminal] Payment processed successfully');
  return result.paymentIntent;
}

/**
 * Cancel the current collect operation if user backs out.
 */
export async function cancelCollect(): Promise<void> {
  if (!terminal) return;

  cancelRequested = true;

  if (!collectInProgress) {
    console.log('[Terminal] No collect in progress to cancel');
    return;
  }

  console.log('[Terminal] Cancelling collect operation...');
  try {
    await terminal.cancelCollectPaymentMethod();
    console.log('[Terminal] Collect cancelled');
  } catch (err) {
    // Ignore - no operation in progress or already cancelled
    console.log('[Terminal] Cancel ignored:', err instanceof Error ? err.message : 'unknown');
  } finally {
    collectInProgress = false;
  }
}

/**
 * Disconnect from reader and clean up.
 */
export async function disconnectReader(): Promise<void> {
  if (!terminal) return;
  await terminal.disconnectReader();
  connectedReader = null;
  connectionPromise = null;
}
