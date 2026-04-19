import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SpecialtyBadge } from '../specialty-badge';

afterEach(cleanup);

describe('SpecialtyBadge', () => {
  it('renders exotic badge only when isExotic=true, isClassic=false', () => {
    render(<SpecialtyBadge isExotic={true} isClassic={false} />);
    expect(screen.getByText('Exotic')).toBeTruthy();
    expect(screen.queryByText('Classic')).toBeNull();
  });

  it('renders classic badge only when isClassic=true, isExotic=false', () => {
    render(<SpecialtyBadge isExotic={false} isClassic={true} />);
    expect(screen.getByText('Classic')).toBeTruthy();
    expect(screen.queryByText('Exotic')).toBeNull();
  });

  it('renders both badges stacked when both true', () => {
    render(<SpecialtyBadge isExotic={true} isClassic={true} />);
    expect(screen.getByText('Exotic')).toBeTruthy();
    expect(screen.getByText('Classic')).toBeTruthy();
    const exotic = screen.getByText('Exotic');
    const classic = screen.getByText('Classic');
    expect(exotic.compareDocumentPosition(classic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders nothing when both false', () => {
    const { container } = render(<SpecialtyBadge isExotic={false} isClassic={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('has correct aria-labels', () => {
    render(<SpecialtyBadge isExotic={true} isClassic={true} />);
    expect(screen.getByLabelText('Exotic vehicle — custom quote required')).toBeTruthy();
    expect(screen.getByLabelText('Classic vehicle — custom quote required')).toBeTruthy();
  });

  it('uses soft orange classes for exotic (not solid amber/uppercase)', () => {
    render(<SpecialtyBadge isExotic={true} isClassic={false} />);
    const badge = screen.getByText('Exotic').closest('span')!;
    expect(badge.className).toContain('bg-orange-50');
    expect(badge.className).toContain('text-orange-700');
    expect(badge.className).toContain('border-orange-200');
    expect(badge.className).not.toContain('uppercase');
    expect(badge.className).not.toContain('tracking-wider');
    expect(badge.className).not.toContain('bg-amber-500');
  });

  it('uses soft slate classes for classic', () => {
    render(<SpecialtyBadge isExotic={false} isClassic={true} />);
    const badge = screen.getByText('Classic').closest('span')!;
    expect(badge.className).toContain('bg-slate-50');
    expect(badge.className).toContain('text-slate-700');
    expect(badge.className).toContain('border-slate-200');
  });

  it('applies custom className', () => {
    const { container } = render(<SpecialtyBadge isExotic={true} isClassic={false} className="mt-2" />);
    expect(container.firstElementChild?.className).toContain('mt-2');
  });
});
