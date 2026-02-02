'use client';

import { CatalogPanel } from './catalog-panel';
import { TicketPanel } from './ticket-panel';

export function PosWorkspace() {
  return (
    <div className="grid h-full grid-cols-[55fr_45fr]">
      <CatalogPanel />
      <TicketPanel />
    </div>
  );
}
