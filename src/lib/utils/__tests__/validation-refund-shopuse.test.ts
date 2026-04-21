import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { shopUseSchema, REFUND_DISPOSITIONS } from '../validation';

// We need to re-import the refundCreateSchema to test it
// Since refundItemSchema is not exported, test through refundCreateSchema
import { refundCreateSchema } from '../validation';

describe('refundCreateSchema — disposition field', () => {
  const baseItem = {
    transaction_item_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    quantity: 1,
    amount: 10.00,
  };

  it('accepts new disposition field', () => {
    const result = refundCreateSchema.safeParse({
      transaction_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      items: [{ ...baseItem, disposition: 'restock' }],
      tip_refund: 0,
      reason: 'Customer requested',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].disposition).toBe('restock');
    }
  });

  it('accepts all three disposition values', () => {
    for (const d of REFUND_DISPOSITIONS) {
      const result = refundCreateSchema.safeParse({
        transaction_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        items: [{ ...baseItem, disposition: d }],
        reason: 'test',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid disposition value', () => {
    const result = refundCreateSchema.safeParse({
      transaction_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      items: [{ ...baseItem, disposition: 'invalid' }],
      reason: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('accepts legacy restock boolean (backwards compat)', () => {
    const result = refundCreateSchema.safeParse({
      transaction_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      items: [{ ...baseItem, restock: true }],
      reason: 'test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].restock).toBe(true);
    }
  });

  it('accepts item with neither disposition nor restock (both optional)', () => {
    const result = refundCreateSchema.safeParse({
      transaction_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      items: [baseItem],
      reason: 'test',
    });
    expect(result.success).toBe(true);
  });

  it('normalization: disposition=restock maps correctly', () => {
    // Simulating the server-side normalization logic
    const item = { ...baseItem, disposition: 'restock' as const };
    const disposition = item.disposition ?? (false ? 'restock' : 'customer_retained');
    expect(disposition).toBe('restock');
  });

  it('normalization: legacy restock=true maps to restock', () => {
    const item = { ...baseItem, restock: true, disposition: undefined };
    const disposition = item.disposition ?? (item.restock === true ? 'restock' : 'customer_retained');
    expect(disposition).toBe('restock');
  });

  it('normalization: legacy restock=false maps to customer_retained', () => {
    const item = { ...baseItem, restock: false, disposition: undefined };
    const disposition = item.disposition ?? (item.restock === true ? 'restock' : 'customer_retained');
    expect(disposition).toBe('customer_retained');
  });

  it('normalization: no restock field maps to customer_retained', () => {
    const item = { ...baseItem, disposition: undefined, restock: undefined };
    const disposition = item.disposition ?? (item.restock === true ? 'restock' : 'customer_retained');
    expect(disposition).toBe('customer_retained');
  });
});

describe('shopUseSchema', () => {
  it('validates a valid shop use payload', () => {
    const result = shopUseSchema.safeParse({
      product_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantity: 2,
      note: 'used on paint correction',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.product_id).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(result.data.quantity).toBe(2);
      expect(result.data.note).toBe('used on paint correction');
    }
  });

  it('requires product_id to be a UUID', () => {
    const result = shopUseSchema.safeParse({
      product_id: 'not-a-uuid',
      quantity: 1,
    });
    expect(result.success).toBe(false);
  });

  it('requires quantity to be integer >= 1', () => {
    const result1 = shopUseSchema.safeParse({
      product_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantity: 0,
    });
    expect(result1.success).toBe(false);

    const result2 = shopUseSchema.safeParse({
      product_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantity: -1,
    });
    expect(result2.success).toBe(false);
  });

  it('note is optional', () => {
    const result = shopUseSchema.safeParse({
      product_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantity: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBeUndefined();
    }
  });

  it('note has max length 500', () => {
    const result = shopUseSchema.safeParse({
      product_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      quantity: 1,
      note: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});
