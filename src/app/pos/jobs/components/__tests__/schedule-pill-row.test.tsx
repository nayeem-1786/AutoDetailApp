import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SchedulePillRow, type ScheduleFilterState } from '../schedule-pill-row';
import type { SchedulePillId } from '@/lib/utils/schedule-date-range';

const TODAY = '2026-06-03'; // Wednesday — enough future range for all pills

function renderRow(
  overrides: {
    selectedPills?: SchedulePillId[];
    otherRange?: { from: string; to: string } | null;
    onChange?: (next: ScheduleFilterState) => void;
  } = {}
) {
  const onChange = overrides.onChange ?? vi.fn();
  const result = render(
    <SchedulePillRow
      selectedPills={overrides.selectedPills ?? []}
      otherRange={overrides.otherRange ?? null}
      todayYmd={TODAY}
      onChange={onChange}
    />
  );
  return { ...result, onChange };
}

afterEach(() => cleanup());

describe('SchedulePillRow — render', () => {
  it('renders all 6 pills with their canonical labels', () => {
    renderRow();
    for (const label of ['Tomorrow', 'This Week', 'Next Week', 'This Month', 'Next 30 Days', 'Other']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeTruthy();
    }
  });

  it('does NOT render a "Today" pill (X1 — Schedule is future-only)', () => {
    renderRow();
    // "Today" appears in admin's filter UI; assert it is absent here so a
    // future copy-paste regression doesn't sneak it in.
    expect(screen.queryByRole('button', { name: /^Today$/i })).toBeNull();
  });

  it('renders a date-range hint under each non-"Other" pill', () => {
    renderRow();
    // Tomorrow on 2026-06-03 (Wed) → hint = "Jun 4"
    expect(screen.getByText('Jun 4')).toBeTruthy();
    // This Week → "Jun 4 – 7"
    expect(screen.getByText(/Jun 4 .* Jun 7/)).toBeTruthy();
    // Next Week → "Jun 8 – 14"
    expect(screen.getByText(/Jun 8 .* Jun 14/)).toBeTruthy();
  });

  it('"Other" hint reads "Pick dates" when no otherRange is set', () => {
    renderRow();
    expect(screen.getByText('Pick dates')).toBeTruthy();
  });

  it('"Other" hint reflects the otherRange when supplied', () => {
    renderRow({ selectedPills: ['other'], otherRange: { from: '2026-06-10', to: '2026-06-15' } });
    expect(screen.getByText(/Jun 10 .* Jun 15/)).toBeTruthy();
  });
});

describe('SchedulePillRow — active state', () => {
  it('selected pill carries aria-pressed=true; unselected ones do not', () => {
    renderRow({ selectedPills: ['tomorrow'] });
    expect(screen.getByRole('button', { name: /Tomorrow/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /This Week/i }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('SchedulePillRow — toggle interactions', () => {
  it('clicking an inactive pill ADDS it to selectedPills', () => {
    const { onChange } = renderRow({ selectedPills: ['tomorrow'] });
    fireEvent.click(screen.getByRole('button', { name: /This Week/i }));
    expect(onChange).toHaveBeenCalledWith({
      selectedPills: ['tomorrow', 'this_week'],
      otherRange: null,
    });
  });

  it('clicking an active pill REMOVES it (toggle off)', () => {
    const { onChange } = renderRow({ selectedPills: ['tomorrow', 'this_week'] });
    fireEvent.click(screen.getByRole('button', { name: /Tomorrow/i }));
    expect(onChange).toHaveBeenCalledWith({
      selectedPills: ['this_week'],
      otherRange: null,
    });
  });

  it('multi-select: clicking a second pill keeps the first active', () => {
    const { onChange } = renderRow({ selectedPills: ['tomorrow'] });
    fireEvent.click(screen.getByRole('button', { name: /Next Week/i }));
    expect(onChange).toHaveBeenLastCalledWith({
      selectedPills: ['tomorrow', 'next_week'],
      otherRange: null,
    });
  });
});

describe('SchedulePillRow — "Other" pill + drawer', () => {
  it('drawer is HIDDEN by default when "Other" is not selected', () => {
    renderRow();
    expect(screen.queryByLabelText(/Custom range — from date/)).toBeNull();
  });

  it('drawer APPEARS when "Other" is in selectedPills', () => {
    renderRow({ selectedPills: ['other'] });
    expect(screen.getByLabelText(/Custom range — from date/)).toBeTruthy();
    expect(screen.getByLabelText(/Custom range — to date/)).toBeTruthy();
  });

  it('drawer DISAPPEARS when "Other" is deselected, and otherRange is cleared', () => {
    const { onChange } = renderRow({
      selectedPills: ['other'],
      otherRange: { from: '2026-06-10', to: '2026-06-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Other/i }));
    expect(onChange).toHaveBeenCalledWith({
      selectedPills: [],
      otherRange: null, // cleared on deselect
    });
  });

  it('valid From + To via the drawer → propagates new otherRange', () => {
    const { onChange } = renderRow({ selectedPills: ['other'] });
    const fromInput = screen.getByLabelText(/Custom range — from date/) as HTMLInputElement;
    const toInput = screen.getByLabelText(/Custom range — to date/) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: '2026-06-10' } });
    fireEvent.change(toInput, { target: { value: '2026-06-15' } });
    expect(onChange).toHaveBeenLastCalledWith({
      selectedPills: ['other'],
      otherRange: { from: '2026-06-10', to: '2026-06-15' },
    });
  });

  it('From in the PAST (< tomorrow) → shows inline error AND clears otherRange', () => {
    const { onChange } = renderRow({
      selectedPills: ['other'],
      otherRange: { from: '2026-06-10', to: '2026-06-15' },
    });
    const fromInput = screen.getByLabelText(/Custom range — from date/) as HTMLInputElement;
    // 2026-06-03 is "today" per the test fixture → past relative to tomorrow.
    fireEvent.change(fromInput, { target: { value: '2026-06-03' } });
    expect(screen.getByRole('alert').textContent).toMatch(/From must be tomorrow or later/);
    expect(onChange).toHaveBeenLastCalledWith({
      selectedPills: ['other'],
      otherRange: null,
    });
  });

  it('To < From → shows inline error AND clears otherRange', () => {
    const { onChange } = renderRow({ selectedPills: ['other'] });
    const fromInput = screen.getByLabelText(/Custom range — from date/) as HTMLInputElement;
    const toInput = screen.getByLabelText(/Custom range — to date/) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: '2026-06-15' } });
    fireEvent.change(toInput, { target: { value: '2026-06-10' } });
    expect(screen.getByRole('alert').textContent).toMatch(/To must be on or after From/);
    // After two edits the last propagation is null because the form is invalid.
    expect(onChange).toHaveBeenLastCalledWith({
      selectedPills: ['other'],
      otherRange: null,
    });
  });

  it('clearing one field → no error, but otherRange becomes null', () => {
    const { onChange } = renderRow({
      selectedPills: ['other'],
      otherRange: { from: '2026-06-10', to: '2026-06-15' },
    });
    const toInput = screen.getByLabelText(/Custom range — to date/) as HTMLInputElement;
    fireEvent.change(toInput, { target: { value: '' } });
    expect(screen.queryByRole('alert')).toBeNull(); // empty isn't an error, just incomplete
    expect(onChange).toHaveBeenLastCalledWith({
      selectedPills: ['other'],
      otherRange: null,
    });
  });

  it('drawer From input carries the X1 floor as `min` attribute (iOS picker hides earlier dates)', () => {
    renderRow({ selectedPills: ['other'] });
    const fromInput = screen.getByLabelText(/Custom range — from date/) as HTMLInputElement;
    // For 2026-06-03 → tomorrow = 2026-06-04
    expect(fromInput.getAttribute('min')).toBe('2026-06-04');
  });

  it('drawer To input takes its `min` from the current From value (cascade)', () => {
    renderRow({ selectedPills: ['other'], otherRange: { from: '2026-06-10', to: '2026-06-15' } });
    const toInput = screen.getByLabelText(/Custom range — to date/) as HTMLInputElement;
    expect(toInput.getAttribute('min')).toBe('2026-06-10');
  });
});
