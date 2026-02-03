import { loadStripeTerminal } from '@stripe/terminal-js';
import type {
  Terminal,
  Reader,
  ISdkManagedPaymentIntent,
  IPaymentIntent,
  ITipConfiguration,
  ICollectConfig,
} from '@stripe/terminal-js';

type TerminalInstance = Terminal;

let terminal: TerminalInstance | null = null;
let connectedReader: Reader | null = null;

async function fetchConnectionToken(): Promise<string> {
  const res = await fetch('/api/pos/stripe/connection-token', {
    method: 'POST',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to get connection token');
  return json.secret;
}

/**
 * Initialize or return the existing Stripe Terminal instance.
 * Singleton — only one terminal instance per browser session.
 */
export async function getTerminal(): Promise<TerminalInstance> {
  if (terminal) return terminal;

  const StripeTerminal = await loadStripeTerminal();
  if (!StripeTerminal) {
    throw new Error('Failed to load Stripe Terminal SDK');
  }

  terminal = StripeTerminal.create({
    onFetchConnectionToken: fetchConnectionToken,
    onUnexpectedReaderDisconnect: () => {
      connectedReader = null;
      console.warn('Stripe Terminal reader disconnected unexpectedly');
    },
  });

  return terminal;
}

/**
 * Discover available readers (simulated or real).
 */
export async function discoverReaders(
  simulated = false
): Promise<Reader[]> {
  const t = await getTerminal();
  const result = await t.discoverReaders({ simulated });

  if ('error' in result) {
    throw new Error(result.error.message);
  }

  return result.discoveredReaders;
}

/**
 * Connect to a reader.
 */
export async function connectReader(reader: Reader): Promise<Reader> {
  const t = await getTerminal();
  const result = await t.connectReader(reader);

  if ('error' in result) {
    throw new Error(result.error.message);
  }

  connectedReader = result.reader;
  return result.reader;
}

/**
 * Get currently connected reader, if any.
 */
export function getConnectedReader(): Reader | null {
  return connectedReader;
}

/**
 * Collect payment method on a PaymentIntent via the terminal reader.
 * Optionally pass tipping config to show tip selection on the reader.
 */
export async function collectPaymentMethod(
  clientSecret: string,
  options?: {
    tip_configuration?: ITipConfiguration;
    config_override?: ICollectConfig;
  }
): Promise<ISdkManagedPaymentIntent> {
  const t = await getTerminal();
  const result = await t.collectPaymentMethod(clientSecret, options);

  if ('error' in result) {
    throw new Error(result.error.message);
  }

  return result.paymentIntent;
}

/**
 * Process the payment after collecting card info.
 */
export async function processPayment(
  paymentIntent: ISdkManagedPaymentIntent
): Promise<IPaymentIntent> {
  const t = await getTerminal();
  const result = await t.processPayment(paymentIntent);

  if ('error' in result) {
    throw new Error(result.error.message);
  }

  return result.paymentIntent;
}

/**
 * Cancel the current collect operation if user backs out.
 */
export async function cancelCollect(): Promise<void> {
  const t = await getTerminal();
  await t.cancelCollectPaymentMethod();
}

/**
 * Disconnect from reader and clean up.
 */
export async function disconnectReader(): Promise<void> {
  if (!terminal) return;
  await terminal.disconnectReader();
  connectedReader = null;
}
