import { getPosToken } from '../context/pos-auth-context';

const POS_SESSION_KEY = 'pos_session';

/**
 * Fetch wrapper for POS API calls.
 * Automatically attaches the X-POS-Session header with the current POS token.
 * Handles 401 responses by clearing the session and redirecting to POS login.
 */
export async function posFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const token = getPosToken();
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set('X-POS-Session', token);
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    // Clear expired session and redirect to POS login
    if (typeof window !== 'undefined') {
      localStorage.removeItem(POS_SESSION_KEY);
      window.location.href = '/pos/login';
    }
    // Return a never-resolving promise to prevent further execution
    return new Promise(() => {});
  }

  return response;
}
