/**
 * Component tests for RoleChip — rendering + tooltip.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleChip } from '../RoleChip';

describe('<RoleChip />', () => {
  it('renders nothing when role is null', () => {
    const { container } = render(<RoleChip role={null} workspaceName="Nova Sound" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the formatted role label', () => {
    render(<RoleChip role="finance_admin" workspaceName="Nova Sound" />);
    expect(screen.getByText('Finance admin')).toBeTruthy();
  });

  it('tooltip (title attr) carries the workspace name', () => {
    render(<RoleChip role="owner" workspaceName="Nova Sound" />);
    const chip = screen.getByText('Owner');
    expect(chip.getAttribute('title')).toBe('Your role in Nova Sound');
  });

  it('falls back to a generic tooltip when no workspace name is given', () => {
    render(<RoleChip role="member" />);
    const chip = screen.getByText('Member');
    expect(chip.getAttribute('title')).toBe('Your workspace role');
  });

  it('compact variant renders only the first letter', () => {
    render(<RoleChip role="owner" workspaceName="Nova Sound" compact />);
    expect(screen.getByText('O')).toBeTruthy();
    expect(screen.queryByText('Owner')).toBeNull();
  });
});
