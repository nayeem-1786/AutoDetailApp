import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SearchInput } from '../search-input';

afterEach(cleanup);

describe('SearchInput', () => {
  it('renders the placeholder text', () => {
    render(<SearchInput value="" onChange={() => {}} placeholder="Find stuff..." />);
    expect(screen.getByPlaceholderText('Find stuff...')).not.toBeNull();
  });

  it('does not render a clear button when value is empty', () => {
    const { container } = render(<SearchInput value="" onChange={() => {}} />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders a clear button when value is non-empty', () => {
    const { container } = render(<SearchInput value="hello" onChange={() => {}} />);
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('calls onChange with the new value when typing', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} placeholder="Type here..." />);
    fireEvent.change(screen.getByPlaceholderText('Type here...'), {
      target: { value: 'abc' },
    });
    expect(onChange).toHaveBeenCalledWith('abc');
  });

  it('clicking the clear button calls onChange with empty string', () => {
    const onChange = vi.fn();
    const { container } = render(<SearchInput value="hello" onChange={onChange} />);
    const clearBtn = container.querySelector('button');
    expect(clearBtn).not.toBeNull();
    fireEvent.click(clearBtn!);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('clicking the clear button also invokes onClear when provided', () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    const { container } = render(
      <SearchInput value="hello" onChange={onChange} onClear={onClear} />
    );
    fireEvent.click(container.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith('');
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('fires onEnter on Enter key, not on other keys', () => {
    const onEnter = vi.fn();
    render(<SearchInput value="q" onChange={() => {}} onEnter={onEnter} placeholder="p" />);
    const input = screen.getByPlaceholderText('p');
    fireEvent.keyDown(input, { key: 'a' });
    expect(onEnter).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('forwards arbitrary props (autoFocus, data-*) to the underlying input', () => {
    render(
      <SearchInput
        value=""
        onChange={() => {}}
        placeholder="p"
        autoFocus
        data-scan-consumer=""
      />
    );
    const input = screen.getByPlaceholderText('p') as HTMLInputElement;
    expect(input.getAttribute('data-scan-consumer')).toBe('');
    expect(document.activeElement).toBe(input);
  });
});
