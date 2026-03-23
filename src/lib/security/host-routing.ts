/**
 * Host-based routing utility for subdomain architecture.
 *
 * Production uses two domains pointing to the same Next.js app:
 * - smartdetailsautospa.com — public site, booking, customer portal
 * - app.smartdetailsautospa.com — admin + POS (IP restricted)
 *
 * All subdomain logic is gated by NEXT_PUBLIC_MAIN_DOMAIN env var.
 * When unset (localhost, ngrok, staging), no redirects or host-based IP checks apply.
 */

export type HostType = 'app' | 'staging' | 'dev' | 'main';

/**
 * Determine the host type from the request Host header.
 * Returns 'dev' when NEXT_PUBLIC_MAIN_DOMAIN is unset (safe default — no subdomain routing).
 */
export function getHostType(host: string): HostType {
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN;
  if (!mainDomain) return 'dev';

  if (host.includes('localhost') || host.includes('127.0.0.1')) return 'dev';
  if (host.startsWith('staging.')) return 'staging';
  if (host.startsWith('app.')) return 'app';
  return 'main';
}

/** Paths that redirect from main domain → app subdomain */
export const STAFF_PATHS = ['/admin', '/pos', '/login'];

/** Paths allowed on the app subdomain (everything else redirects to main domain) */
export const APP_ALLOWED_PATHS = ['/admin', '/pos', '/login', '/auth', '/_next', '/favicon'];
