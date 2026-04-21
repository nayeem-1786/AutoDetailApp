import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Toggle-able state for the two supabase clients. Individual tests mutate
// these before firing the route.
const state = {
  user: { id: 'u-1' } as { id: string } | null,
  employee: { id: 'e-1' } as { id: string } | null,
  lookupProduct: null as Record<string, unknown> | null,
  lookupError: null as { message: string } | null,
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'employees') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: state.employee, error: null }),
            }),
          }),
        };
      }
      if (table === 'products') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: state.lookupProduct,
                    error: state.lookupError,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

// Imported AFTER mocks so they bind to the mocked modules.
import { POST } from '../barcode-lookup/route';

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/products/barcode-lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  state.user = { id: 'u-1' };
  state.employee = { id: 'e-1' };
  state.lookupProduct = null;
  state.lookupError = null;
});

describe('POST /api/admin/products/barcode-lookup', () => {
  it('200 with the matched product when barcode found', async () => {
    state.lookupProduct = { id: 'p-1', name: 'Foo', barcode: 'B-1' };
    const res = await POST(req({ barcode: 'B-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.product).toEqual({ id: 'p-1', name: 'Foo', barcode: 'B-1' });
  });

  it('200 with product: null when no match', async () => {
    state.lookupProduct = null;
    const res = await POST(req({ barcode: 'nonexistent' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.product).toBeNull();
  });

  it('400 when barcode is missing or empty', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);

    const res2 = await POST(req({ barcode: '  ' }));
    expect(res2.status).toBe(400);
  });

  it('401 when no authenticated user', async () => {
    state.user = null;
    const res = await POST(req({ barcode: 'B-1' }));
    expect(res.status).toBe(401);
  });

  it('403 when authenticated user is not an employee', async () => {
    state.employee = null;
    const res = await POST(req({ barcode: 'B-1' }));
    expect(res.status).toBe(403);
  });

  it('500 when supabase lookup returns an error', async () => {
    state.lookupError = { message: 'db down' };
    const res = await POST(req({ barcode: 'B-1' }));
    expect(res.status).toBe(500);
  });
});
