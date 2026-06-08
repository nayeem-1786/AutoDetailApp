/**
 * Phase 3 Class (b) Track A — shared UUID v4 generator (C.1 step 2 relocation).
 *
 * Relocated from per-reducer local copies (ticket-reducer.ts + quote-reducer.ts)
 * + apply-add-service.ts private copy. C.1 step 2's ADD_PRODUCT extraction
 * brought the call-site count to 3 (the threshold flagged in
 * apply-add-service.ts's internal docs: "C.1 step 2 (ADD_PRODUCT extraction)
 * will relocate this to a shared utility once three call sites need it.").
 *
 * Both reducers, apply-add-service.ts, and apply-add-product.ts (new in
 * this step) now consume this single canonical implementation.
 *
 * Behavior is byte-equivalent to the 3 pre-relocation copies.
 */
export function generateId(): string {
  // Fallback for older Safari/iPad that lack crypto.randomUUID()
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
