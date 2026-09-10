/**
 * The inline editor, and the reason it does not commit on blur.
 *
 * Blur is ambiguous — clicking away can mean "done" or "forget it" — and
 * guessing wrong on a phone number writes a half-typed one. So the editor
 * stays open until the user says which. The row's rate editor used to commit
 * on blur; it goes through this now too, because two inline editors that
 * behave differently is worse than one that asks.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InlineField } from '../inline-field';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function setup(props: Partial<React.ComponentProps<typeof InlineField>> = {}) {
  const onCommit = vi.fn().mockResolvedValue({ ok: true });
  render(
    <InlineField value="555-0100" label="Phone" onCommit={onCommit} {...props} />,
  );
  return { onCommit };
}

function openEditor(name = /Phone: 555-0100\. Edit/) {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('textbox', { name: 'Phone' });
}

describe('<InlineField />', () => {
  it('writes when the check is pressed', async () => {
    const { onCommit } = setup();
    const input = openEditor();

    fireEvent.change(input, { target: { value: '555-0199' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Phone' }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('555-0199'));
  });

  it('writes on Enter', async () => {
    const { onCommit } = setup();
    const input = openEditor();

    fireEvent.change(input, { target: { value: '555-0199' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('555-0199'));
  });

  it('does nothing on blur — neither saving nor closing', () => {
    // The whole point. A stray click must not write a half-typed number, and
    // must not silently throw away what was typed either.
    const { onCommit } = setup();
    const input = openEditor();

    fireEvent.change(input, { target: { value: '555-01' } });
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Phone' })).toBeTruthy();
  });

  it('abandons on the cross, and on Escape', () => {
    const { onCommit } = setup();
    const input = openEditor();
    fireEvent.change(input, { target: { value: '555-0199' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing Phone' }));

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Phone' })).toBeNull();

    const reopened = openEditor();
    fireEvent.change(reopened, { target: { value: 'nonsense' } });
    fireEvent.keyDown(reopened, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not write when nothing changed', () => {
    const { onCommit } = setup();
    const input = openEditor();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('treats an emptied field as clearing it', async () => {
    const { onCommit } = setup();
    const input = openEditor();

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(null));
  });

  it('stays open with the draft intact when the write is rejected', async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: false, error: 'That does not look like an email address.' });
    render(<InlineField value="a@b.com" label="Email" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button', { name: /Email: a@b\.com\. Edit/ }));
    const input = screen.getByRole('textbox', { name: 'Email' });

    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onCommit).toHaveBeenCalled());
    // The correction is usually one keypress; throwing the draft away costs it.
    expect((screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement).value).toBe('not-an-email');
  });

  it('keeps a target when there is no value yet', () => {
    // An empty fact is exactly the one you want to fill, so the control stays
    // clickable and merely says less.
    setup({ value: null, emptyLabel: 'Add phone' });
    expect(screen.getByRole('button', { name: 'Add phone' })).toBeTruthy();
  });
});
