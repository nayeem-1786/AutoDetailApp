/**
 * #136 Q4/Q5/B6 — FormField `reserveErrorSpace` opt-in.
 *
 * Default behavior preserves the pre-#136 conditional error rendering
 * (no blast radius for the ~54 existing FormField consumers). Opting in
 * via `reserveErrorSpace` always renders the error `<p>` with min-h-[1rem]
 * so toggling an error on/off doesn't shift surrounding layout — the
 * vehicle-form fields opt in because real-time validation cycles errors
 * on every keystroke.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FormField } from '../form-field';

afterEach(cleanup);

describe('#136 FormField reserveErrorSpace prop', () => {
  it('default behavior: error <p> renders only when error is non-empty', () => {
    const { rerender } = render(
      <FormField label="Color">
        <input />
      </FormField>
    );
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(
      <FormField label="Color" error="Required">
        <input />
      </FormField>
    );
    expect(screen.getByText('Required')).not.toBeNull();
  });

  it('reserveErrorSpace=true: error region renders even with no error (zero layout shift)', () => {
    render(
      <FormField label="Color" reserveErrorSpace>
        <input />
      </FormField>
    );
    const region = screen.getByRole('alert');
    expect(region).not.toBeNull();
    expect(region.textContent).toBe('');
    expect(region.className).toContain('min-h-[1rem]');
  });

  it('reserveErrorSpace=true: error text populates same region without re-creating it', () => {
    const { rerender } = render(
      <FormField label="Color" reserveErrorSpace>
        <input />
      </FormField>
    );
    const before = screen.getByRole('alert');
    expect(before.textContent).toBe('');

    rerender(
      <FormField label="Color" reserveErrorSpace error="Required">
        <input />
      </FormField>
    );
    const after = screen.getByRole('alert');
    expect(after.textContent).toBe('Required');
    // Same DOM element identity = zero layout shift, just text swap.
    expect(after.className).toContain('min-h-[1rem]');
  });

  it('reserveErrorSpace=true: aria-live="polite" announces errors to screen readers', () => {
    render(
      <FormField label="Color" reserveErrorSpace error="Required">
        <input />
      </FormField>
    );
    const region = screen.getByRole('alert');
    expect(region.getAttribute('aria-live')).toBe('polite');
  });
});
