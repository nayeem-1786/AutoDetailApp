import { revalidateTag as nextRevalidateTag } from 'next/cache';

/**
 * Wrapper around Next.js revalidateTag that provides the required
 * cache-life profile argument. In Next.js 16.x, revalidateTag requires
 * a second `profile` parameter. We default to `{ expire: 0 }` which
 * means "expire immediately" — the standard behavior for on-demand
 * revalidation.
 */
export function revalidateTag(tag: string) {
  return nextRevalidateTag(tag, { expire: 0 });
}
