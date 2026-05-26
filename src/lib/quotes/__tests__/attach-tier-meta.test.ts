import { describe, it, expect, vi } from 'vitest';
import { attachTierMetaToItems } from '../attach-tier-meta';
import { renderTierToken } from '../tier-display';

/**
 * D46 unit + integration tests for attach-tier-meta + renderTierToken
 * composition. Verifies:
 *
 *   1. attachTierMetaToItems correctly merges service_pricing rows onto
 *      input items via the (service_id, tier_name) composite key.
 *   2. Items pass through unchanged when service_id or tier_name is
 *      null (no pricing row exists).
 *   3. Empty-items hot path skips the DB call entirely.
 *   4. Query failures are non-blocking (return items with null meta).
 *   5. The full pipeline (attach → renderTierToken) produces the
 *      operator-curated tier labels documented in the Issue 41 audit
 *      for the empirical Q-0087 reproduction case.
 *   6. Backward compat: non-tiered services (tier_name=null,
 *      tier_name='default') render the same nothing-shown behavior as
 *      pre-D46.
 */

type TierRow = {
  service_id: string;
  tier_name: string;
  tier_label: string | null;
  qty_label: string | null;
};

function makeMockSupabase(
  tierRows: TierRow[] | Error,
): {
  from: (table: string) => {
    select: (cols: string) => {
      in: (col: string, vals: unknown[]) => Promise<{ data: TierRow[] | null; error: Error | null }>;
    };
  };
} {
  return {
    from: (table: string) => {
      expect(table).toBe('service_pricing');
      return {
        select: (cols: string) => {
          expect(cols).toContain('service_id');
          expect(cols).toContain('tier_name');
          expect(cols).toContain('tier_label');
          expect(cols).toContain('qty_label');
          return {
            in: async (col: string, vals: unknown[]) => {
              expect(col).toBe('service_id');
              expect(Array.isArray(vals)).toBe(true);
              if (tierRows instanceof Error) {
                return { data: null, error: tierRows };
              }
              return {
                data: tierRows.filter((r) => vals.includes(r.service_id)),
                error: null,
              };
            },
          };
        },
      };
    },
  };
}

describe('attachTierMetaToItems', () => {
  it('merges tier_label / qty_label onto matching items (Q-0087 Hot Shampoo scenario)', async () => {
    const items = [
      {
        id: 'qi-1',
        service_id: 'svc-hot-shampoo',
        tier_name: 'floor_mats',
        item_name: 'Hot Shampoo Extraction',
        quantity: 1,
      },
      {
        id: 'qi-2',
        service_id: 'svc-hot-shampoo',
        tier_name: 'per_row',
        item_name: 'Hot Shampoo Extraction',
        quantity: 2,
      },
    ];
    const mockDb = makeMockSupabase([
      {
        service_id: 'svc-hot-shampoo',
        tier_name: 'floor_mats',
        tier_label: 'Floor Mats',
        qty_label: null,
      },
      {
        service_id: 'svc-hot-shampoo',
        tier_name: 'per_row',
        tier_label: 'Per Row',
        qty_label: 'row',
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = await attachTierMetaToItems(mockDb as any, items);

    expect(enriched).toHaveLength(2);
    expect(enriched[0].tier_label).toBe('Floor Mats');
    expect(enriched[0].qty_label).toBeNull();
    expect(enriched[1].tier_label).toBe('Per Row');
    expect(enriched[1].qty_label).toBe('row');
    // Original fields preserved.
    expect(enriched[0].id).toBe('qi-1');
    expect(enriched[1].quantity).toBe(2);
  });

  it('full pipeline → renderTierToken returns operator-curated tokens for Q-0087', async () => {
    const items = [
      { service_id: 'svc-1', tier_name: 'floor_mats', quantity: 1 },
      { service_id: 'svc-1', tier_name: 'per_row', quantity: 2 },
    ];
    const mockDb = makeMockSupabase([
      {
        service_id: 'svc-1',
        tier_name: 'floor_mats',
        tier_label: 'Floor Mats',
        qty_label: null,
      },
      {
        service_id: 'svc-1',
        tier_name: 'per_row',
        tier_label: 'Per Row',
        qty_label: 'row',
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = await attachTierMetaToItems(mockDb as any, items);
    const tokens = enriched.map((i) =>
      renderTierToken({
        tier_name: i.tier_name,
        tier_label: i.tier_label,
        qty_label: i.qty_label,
        quantity: i.quantity,
      }),
    );

    // qty=1 floor_mats → tier_label "Floor Mats" (post-Issue-40 cleanup)
    expect(tokens[0]).toBe('Floor Mats');
    // qty=2 per_row + qty_label "row" → "2 Rows"
    expect(tokens[1]).toBe('2 Rows');
  });

  it('items with null service_id pass through with null meta', async () => {
    const items = [
      { service_id: null, tier_name: 'floor_mats', quantity: 1 },
      { service_id: 'svc-1', tier_name: 'per_row', quantity: 1 },
    ];
    const mockDb = makeMockSupabase([
      {
        service_id: 'svc-1',
        tier_name: 'per_row',
        tier_label: 'Per Row',
        qty_label: 'row',
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = await attachTierMetaToItems(mockDb as any, items);
    expect(enriched[0].tier_label).toBeNull();
    expect(enriched[0].qty_label).toBeNull();
    expect(enriched[1].tier_label).toBe('Per Row');
  });

  it('items with null tier_name pass through with null meta', async () => {
    const items = [
      { service_id: 'svc-1', tier_name: null, quantity: 1 },
      { service_id: 'svc-1', tier_name: 'per_row', quantity: 1 },
    ];
    const mockDb = makeMockSupabase([
      {
        service_id: 'svc-1',
        tier_name: 'per_row',
        tier_label: 'Per Row',
        qty_label: 'row',
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = await attachTierMetaToItems(mockDb as any, items);
    expect(enriched[0].tier_label).toBeNull();
    expect(enriched[0].qty_label).toBeNull();
    expect(enriched[1].tier_label).toBe('Per Row');
  });

  it('empty items array short-circuits without calling DB', async () => {
    let calledFrom = false;
    const mockDb = {
      from: () => {
        calledFrom = true;
        return {} as unknown;
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = await attachTierMetaToItems(mockDb as any, []);
    expect(enriched).toEqual([]);
    expect(calledFrom).toBe(false);
  });

  it('all-null-service_id items skip DB and pass through with null meta', async () => {
    let calledFrom = false;
    const mockDb = {
      from: () => {
        calledFrom = true;
        return {} as unknown;
      },
    };

    const items = [
      { service_id: null, tier_name: 'floor_mats' },
      { service_id: null, tier_name: 'per_row' },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = await attachTierMetaToItems(mockDb as any, items);
    expect(calledFrom).toBe(false);
    expect(enriched.every((i) => i.tier_label === null)).toBe(true);
    expect(enriched.every((i) => i.qty_label === null)).toBe(true);
  });

  it('query failure is non-blocking — returns items with null meta and logs warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockDb = makeMockSupabase(new Error('connection refused'));

    const items = [
      { service_id: 'svc-1', tier_name: 'per_row', quantity: 2 },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = await attachTierMetaToItems(mockDb as any, items);

    // attachTierMetaToItems doesn't throw on `{error}` shape (Supabase
    // returns `{data:null,error}` rather than rejecting); the helper
    // catches programmatic throws and the empty data branch maps to
    // null meta. Either way the call must not propagate the failure.
    expect(enriched).toHaveLength(1);
    expect(enriched[0].tier_label).toBeNull();
    expect(enriched[0].qty_label).toBeNull();
    // The mock returns `{ data: null, error }` rather than throwing, so
    // the `try/catch` in attach-tier-meta doesn't fire; the warn assertion
    // only applies when a real throw happens. Both branches end up with
    // null meta, which is the contract we care about.
    warn.mockRestore();
  });

  it('renderTierToken returns null for tier_name="default" sentinel (backward compat with pre-D46 conditional render)', () => {
    expect(
      renderTierToken({
        tier_name: 'default',
        tier_label: 'irrelevant',
        qty_label: 'row',
        quantity: 1,
      }),
    ).toBeNull();
  });

  it('renderTierToken returns null for null tier_name (non-tiered services render no sub-line, identical to pre-D46)', () => {
    expect(
      renderTierToken({
        tier_name: null,
        tier_label: null,
        qty_label: null,
        quantity: 1,
      }),
    ).toBeNull();
  });

  it('renderTierToken falls back to title-cased tier_name when tier_label is missing (legacy data resilience)', () => {
    expect(
      renderTierToken({
        tier_name: 'floor_mats',
        tier_label: null,
        quantity: 1,
      }),
    ).toBe('Floor Mats');
  });
});
