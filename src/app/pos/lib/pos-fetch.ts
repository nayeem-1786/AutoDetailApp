import { getPosToken } from '../context/pos-auth-context';

/**
 * Fetch wrapper for POS API calls.
 * Automatically attaches the X-POS-Session header with the current POS token.
 */
export function posFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const token = getPosToken();
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set('X-POS-Session', token);
  }

  return fetch(input, { ...init, headers });
}
