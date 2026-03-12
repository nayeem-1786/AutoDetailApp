'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-8 py-3 text-base font-semibold text-site-text shadow-sm transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 print:hidden"
    >
      <Printer className="h-5 w-5" />
      Print / Save as PDF
    </button>
  );
}
