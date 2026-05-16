/**
 * @deprecated This file is a backward-compat shim for the canonical engine
 * at `src/lib/services/picker-engine.ts`. New code MUST import from
 * `@/lib/services/picker-engine` (or `@/lib/services`) directly. Per
 * CLAUDE.md Rule 22.
 *
 * This shim will be removed once all existing call sites are migrated
 * (Item 15f Layer 3b — currently deferred indefinitely).
 */
export {
  resolveServicePrice,
  resolveServicePriceWithSale,
  getServicePriceRange,
  type ResolvedPrice,
} from '@/lib/services/picker-engine';
