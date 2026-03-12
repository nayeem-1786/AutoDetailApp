import { revalidateTag as nextRevalidateTag } from 'next/cache';

/**
 * Wrapper around Next.js revalidateTag for on-demand revalidation.
 */
export function revalidateTag(tag: string) {
  return nextRevalidateTag(tag);
}
