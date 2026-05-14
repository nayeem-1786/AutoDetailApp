/**
 * @deprecated Use '@/lib/utils/money' directly. This re-export shim
 * survives the Money-Unify epic so the 21 existing importers don't
 * have to migrate in a single commit; per-family phases migrate
 * their importers individually. Shim is deleted in Unify-Final.
 *
 * Renamed from refund-math.ts → money.ts in Phase Money-Unify-1.
 * See docs/dev/MONEY.md.
 */
export * from './money';
