/**
 * Phase 3 Theme E.1 — customer_credits barrel export.
 *
 * Single import surface for the credit subsystem. E.2 + E.3 extend this module
 * with application logic / operator-UI hooks; consumers should import from
 * '@/lib/credits' (not the individual sub-paths) so the module's public API
 * is centralized.
 */
export * from './types';
export * from './repository';
