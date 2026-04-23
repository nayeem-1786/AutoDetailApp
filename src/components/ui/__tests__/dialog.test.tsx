import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../dialog';

afterEach(cleanup);

describe('Dialog — className prop contracts (Session 42J)', () => {
  function renderDialog(
    props: Omit<React.ComponentProps<typeof Dialog>, 'open' | 'onOpenChange' | 'children'>
  ) {
    return render(
      <Dialog open={true} onOpenChange={() => {}} {...props}>
        <DialogHeader>
          <DialogTitle>Test</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div data-testid="dialog-body">body</div>
        </DialogContent>
      </Dialog>
    );
  }

  it('wrapperClassName is applied to the centering container', () => {
    const { container } = renderDialog({
      wrapperClassName: 'custom-wrapper-class',
    });
    const wrapper = container.querySelector('.custom-wrapper-class');
    expect(wrapper).not.toBeNull();
    // Centering container is the element that also has flex + items-center.
    expect(wrapper?.className).toContain('flex');
    expect(wrapper?.className).toContain('items-center');
  });

  it('contentClassName is applied to the inner panel', () => {
    const { container } = renderDialog({
      contentClassName: 'custom-content-class',
    });
    const panel = container.querySelector('.custom-content-class');
    expect(panel).not.toBeNull();
    // Inner panel is the element that also has rounded-lg and bg-ui-bg.
    expect(panel?.className).toContain('rounded-lg');
    expect(panel?.className).toContain('bg-ui-bg');
  });

  it('preserves the default centering classes when wrapperClassName is passed', () => {
    const { container } = renderDialog({
      wrapperClassName: '[@media(max-height:768px)]:items-start',
    });
    // The arbitrary-variant class should land on the same element as the
    // default items-center — so that the media query overrides at runtime.
    const wrapper = container.querySelector('[class*="items-center"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('[@media(max-height:768px)]:items-start');
  });

  it('omitting both className props leaves defaults intact', () => {
    const { container } = renderDialog({});
    const wrapper = container.querySelector('.items-center');
    const panel = container.querySelector('.rounded-lg');
    expect(wrapper).not.toBeNull();
    expect(panel).not.toBeNull();
  });
});
