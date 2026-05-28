import { describe, it, expect } from 'vitest';
import { describeSupabaseError } from '../supabase-error';
import { serviceCreateSchema } from '../validation';

describe('describeSupabaseError (Catalog S3)', () => {
  it('maps 23502 NOT NULL with the offending column name', () => {
    const err = { code: '23502', message: 'null value in column "slug" violates not-null constraint' };
    expect(describeSupabaseError(err, 'fallback')).toBe('Required field "slug" is missing.');
  });

  it('maps 23502 without a parseable column to a generic required-field message', () => {
    const err = { code: '23502', message: 'not-null violation' };
    expect(describeSupabaseError(err, 'fallback')).toBe('A required field is missing.');
  });

  it('maps 23505 unique violation', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "some_unique"' };
    expect(describeSupabaseError(err, 'fallback')).toMatch(/unique/i);
  });

  it('maps a named slug-unique constraint to friendly slug text (before generic 23505)', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "services_slug_key"' };
    expect(describeSupabaseError(err, 'fallback')).toMatch(/slug already exists/i);
  });

  it('maps 23514 check violation (sale-price constraint) to friendly text', () => {
    const err = { code: '23514', message: 'new row violates check constraint "chk_service_sale_price"' };
    expect(describeSupabaseError(err, 'fallback')).toMatch(/sale price must be lower/i);
  });

  it('maps a generic 23514 check violation', () => {
    const err = { code: '23514', message: 'violates check constraint "some_other_check"' };
    expect(describeSupabaseError(err, 'fallback')).toMatch(/database rule/i);
  });

  it('falls back to the raw .message for unknown errors', () => {
    const err = { code: 'XX999', message: 'something specific went wrong' };
    expect(describeSupabaseError(err, 'fallback')).toBe('something specific went wrong');
  });

  it('falls back to the provided fallback when no message/object', () => {
    expect(describeSupabaseError(null, 'Failed to create service')).toBe('Failed to create service');
    expect(describeSupabaseError({ code: '23502' }, 'Failed to create service')).toBe('A required field is missing.');
    expect(describeSupabaseError({}, 'Failed to create service')).toBe('Failed to create service');
  });
});

describe('serviceCreateSchema slug (Catalog C1)', () => {
  const base = { name: 'Full Detail', pricing_model: 'flat' as const };

  it('accepts a valid slug', () => {
    const r = serviceCreateSchema.safeParse({ ...base, slug: 'full-detail' });
    expect(r.success).toBe(true);
  });

  it('is optional (create form slugifies/validates separately)', () => {
    const r = serviceCreateSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('rejects an invalid slug (uppercase / spaces)', () => {
    const r = serviceCreateSchema.safeParse({ ...base, slug: 'Full Detail' });
    expect(r.success).toBe(false);
  });
});
