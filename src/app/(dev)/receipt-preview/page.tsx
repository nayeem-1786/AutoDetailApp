import { notFound } from 'next/navigation';

/**
 * Receipt preview harness — placeholder.
 *
 * Phase 0b.1 (current) ships only this placeholder. Phase 0b.3 will turn
 * this into a 12-scenario × 4-surface visual preview rendering harness for
 * pre-Phase-1 UX review without DB writes.
 *
 * Production gate: any non-development NODE_ENV returns 404.
 */
export default function ReceiptPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-gray-900">
        Receipt Preview Harness — Coming in Phase 0b.3
      </h1>
      <p className="mt-4 text-gray-700">
        This page will render all 12 receipt scenarios across 4 surfaces
        (Thermal / HTML / Public Page / POS Ticket Totals) for visual UX
        review before Phase 1&apos;s running-receipt UX changes ship.
      </p>
      <ul className="mt-6 space-y-1 text-sm text-gray-600">
        <li>
          <strong>Phase 0b.1 (current):</strong> Composer foundation + unit tests.
        </li>
        <li>
          <strong>Phase 0b.2 (next):</strong> Public page consolidation + byte-diff harness.
        </li>
        <li>
          <strong>Phase 0b.3 (following):</strong> This page&apos;s full implementation.
        </li>
      </ul>
      <p className="mt-6 text-sm text-gray-500">
        Fixture inputs live at{' '}
        <code className="rounded bg-gray-100 px-1">
          src/lib/data/__tests__/__fixtures__/receipt-baselines/inputs.ts
        </code>
        . Re-capture with{' '}
        <code className="rounded bg-gray-100 px-1">
          npx tsx scripts/capture-receipt-baselines.ts
        </code>
        .
      </p>
    </main>
  );
}
