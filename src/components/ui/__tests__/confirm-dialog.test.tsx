import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfirmDialog } from '../confirm-dialog';

afterEach(cleanup);

describe('ConfirmDialog — blockedByExternalError prop (Session 42K-patch-1)', () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
    return render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Test"
        description="desc"
        onConfirm={props.onConfirm ?? (() => {})}
        requireConfirmText={props.requireConfirmText ?? 'CONFIRM'}
        confirmLabel={props.confirmLabel ?? 'Submit'}
        {...props}
      />
    );
  }

  it('hides the type-to-confirm input when blockedByExternalError=true', () => {
    renderDialog({ blockedByExternalError: true });
    expect(screen.queryByPlaceholderText(/Type "CONFIRM" to confirm/i)).toBeNull();
  });

  it('shows the type-to-confirm input when blockedByExternalError=false (default)', () => {
    renderDialog({ blockedByExternalError: false });
    expect(screen.queryByPlaceholderText(/Type "CONFIRM" to confirm/i)).not.toBeNull();
  });

  it('disables the confirm button when blockedByExternalError=true regardless of typed text', () => {
    renderDialog({ blockedByExternalError: true });
    const submit = screen.getByRole('button', { name: /Submit/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('disables the confirm button when blockedByExternalError=true even with no requireConfirmText', () => {
    renderDialog({ blockedByExternalError: true, requireConfirmText: undefined });
    const submit = screen.getByRole('button', { name: /Submit/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('does NOT call onConfirm when the (disabled) confirm button is clicked while blocked', () => {
    const onConfirm = vi.fn();
    renderDialog({ blockedByExternalError: true, onConfirm });
    const submit = screen.getByRole('button', { name: /Submit/i });
    fireEvent.click(submit);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('preserves normal type-to-confirm gating when blockedByExternalError is undefined', () => {
    renderDialog({});
    const submit = screen.getByRole('button', { name: /Submit/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const input = screen.getByPlaceholderText(/Type "CONFIRM" to confirm/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'CONFIRM' } });
    expect(submit.disabled).toBe(false);
  });
});
