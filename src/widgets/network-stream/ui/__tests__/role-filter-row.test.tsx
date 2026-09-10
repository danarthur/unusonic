/**
 * The role filter is subordinate to the tabs, and absent until it earns space.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoleFilterRow, ROLE_FILTER_MIN_ROWS } from '../RoleFilterRow';

describe('RoleFilterRow', () => {
  // A filter over one role narrows nothing.
  it('renders nothing when there is only one role to choose', () => {
    const { container } = render(<RoleFilterRow roles={['dj']} active={null} onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('offers All plus every role present', () => {
    render(<RoleFilterRow roles={['dj', 'photographer']} active={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'dj' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'photographer' })).toBeTruthy();
  });

  it('shows a label in place of the slug when one is given', () => {
    render(
      <RoleFilterRow
        roles={['photo_booth', 'dj']}
        active={null}
        onSelect={vi.fn()}
        labels={{ photo_booth: 'Photo booth' }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Photo booth' })).toBeTruthy();
    // No label for this one, so the slug stands in rather than nothing showing.
    expect(screen.getByRole('button', { name: 'dj' })).toBeTruthy();
  });

  it('reports the role picked, and null for All', () => {
    const onSelect = vi.fn();
    render(<RoleFilterRow roles={['dj', 'mc']} active="dj" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'mc' }));
    expect(onSelect).toHaveBeenCalledWith('mc');

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('marks the active role as pressed, and only that one', () => {
    render(<RoleFilterRow roles={['dj', 'mc']} active="dj" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'dj' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'mc' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('false');
  });

  // A screenful, not a headcount: below this the eye does the filtering, and a
  // control nobody needed is one more thing carrying state.
  it('sets the reveal threshold where a section stops fitting on screen', () => {
    expect(ROLE_FILTER_MIN_ROWS).toBeGreaterThanOrEqual(20);
    expect(ROLE_FILTER_MIN_ROWS).toBeLessThanOrEqual(40);
  });
});
