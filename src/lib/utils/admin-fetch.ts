/**
 * Authenticated fetch wrapper for admin pages
 * Handles 401 responses by redirecting to login
 */

export async function adminFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const response = await fetch(url, options);

  // If unauthorized, redirect to login
  if (response.status === 401) {
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/admin';
    window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}&reason=session_expired`;
    // Return a never-resolving promise to prevent further execution
    return new Promise(() => {});
  }

  return response;
}

/**
 * Helper that fetches JSON and handles auth errors
 * Returns { data, error } pattern
 */
export async function adminFetchJson<T>(
  url: string,
  options?: RequestInit
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await adminFetch(url, options);
    const json = await response.json();

    if (!response.ok) {
      return { data: null, error: json.error || response.statusText };
    }

    return { data: json.data ?? json, error: null };
  } catch (err) {
    console.error('adminFetchJson error:', err);
    return { data: null, error: 'Network error' };
  }
}
