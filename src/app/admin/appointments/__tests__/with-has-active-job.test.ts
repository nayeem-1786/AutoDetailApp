import { describe, it, expect } from 'vitest';

// Session #110 corrective — unit tests for the admin `withHasActiveJob` mapper.
// Extracted to its own module (`has-active-job.ts`) because Next.js page files
// may not carry arbitrary named exports — importing it here is clean + cheap.
import { withHasActiveJob } from '../has-active-job';

describe('withHasActiveJob — Supabase relation cardinality shapes', () => {
  it('single object (1:1 cardinality, the production shape) with non-terminal job → true', () => {
    const [a] = withHasActiveJob([{ id: 'apt-1', jobs: { id: 'j1', status: 'scheduled' } }]);
    expect(a.has_active_job).toBe(true);
  });

  it('single object with terminal job → false', () => {
    const [a] = withHasActiveJob([{ id: 'apt-1', jobs: { id: 'j1', status: 'completed' } }]);
    expect(a.has_active_job).toBe(false);
  });

  it('null jobs → false', () => {
    const [a] = withHasActiveJob([{ id: 'apt-1', jobs: null }]);
    expect(a.has_active_job).toBe(false);
  });

  it('undefined jobs → false', () => {
    const [a] = withHasActiveJob([{ id: 'apt-1' }]);
    expect(a.has_active_job).toBe(false);
  });

  it('array shape still works (defensive): any non-terminal → true', () => {
    const [a] = withHasActiveJob([
      { id: 'apt-1', jobs: [{ id: 'j1', status: 'completed' }, { id: 'j2', status: 'intake' }] },
    ]);
    expect(a.has_active_job).toBe(true);
  });

  it('array shape, all terminal → false', () => {
    const [a] = withHasActiveJob([{ id: 'apt-1', jobs: [{ id: 'j1', status: 'cancelled' }] }]);
    expect(a.has_active_job).toBe(false);
  });

  it('strips the raw jobs relation from the result (both shapes)', () => {
    const [obj] = withHasActiveJob([{ id: 'apt-1', jobs: { id: 'j1', status: 'scheduled' } }]);
    const [arr] = withHasActiveJob([{ id: 'apt-2', jobs: [{ id: 'j2', status: 'scheduled' }] }]);
    expect((obj as unknown as Record<string, unknown>).jobs).toBeUndefined();
    expect((arr as unknown as Record<string, unknown>).jobs).toBeUndefined();
  });
});
