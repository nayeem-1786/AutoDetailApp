import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// TeamGridLayout — Flexbox-based centered layout with row distribution
// ---------------------------------------------------------------------------
// Splits members into rows based on total count so every row is centered:
//   1 → [1]
//   2 → [2]
//   3 → [3]
//   4 → [2, 2]
//   5 → [2, 3]
//   6 → [3, 3]
//   7+ → rows of 3, last row gets remainder
// ---------------------------------------------------------------------------

interface TeamGridLayoutProps<T extends { id: string }> {
  items: T[];
  renderCard: (item: T) => ReactNode;
  /** Tailwind width class for each card. Default: "w-full sm:w-72" */
  cardWidth?: string;
  /** Tailwind gap between rows. Default: "space-y-8" */
  rowGap?: string;
  /** Tailwind gap between cards in a row. Default: "gap-6" */
  cardGap?: string;
}

function splitIntoRows<T>(items: T[]): T[][] {
  const count = items.length;

  switch (count) {
    case 0:
      return [];
    case 1:
    case 2:
    case 3:
      return [items];
    case 4:
      return [items.slice(0, 2), items.slice(2, 4)];
    case 5:
      return [items.slice(0, 2), items.slice(2, 5)];
    case 6:
      return [items.slice(0, 3), items.slice(3, 6)];
    default: {
      const rows: T[][] = [];
      for (let i = 0; i < count; i += 3) {
        rows.push(items.slice(i, Math.min(i + 3, count)));
      }
      return rows;
    }
  }
}

export function TeamGridLayout<T extends { id: string }>({
  items,
  renderCard,
  cardWidth = 'w-full sm:w-72',
  rowGap = 'space-y-8',
  cardGap = 'gap-6',
}: TeamGridLayoutProps<T>) {
  if (items.length === 0) return null;

  const rows = splitIntoRows(items);

  return (
    <div className={rowGap}>
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className={`flex justify-center ${cardGap} flex-wrap`}>
          {row.map((item) => (
            <div key={item.id} className={cardWidth}>
              {renderCard(item)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
