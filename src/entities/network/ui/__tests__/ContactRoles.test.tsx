/**
 * What a contact is to us — all of it.
 *
 * The graph has always allowed a person to hold several roles, and
 * `fileContact` has always been able to write one. The offer appeared only in
 * the Unsorted lane, so a contact who already had a role could never gain a
 * second — which is why a freelance DJ could not also be a vendor, and why
 * looking for him under Vendors found nothing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getEntityRoles = vi.fn();
const fileContact = vi.fn();
vi.mock('@/features/network-data/api/get-entity-roles', () => ({
  getEntityRoles: (...a: unknown[]) => getEntityRoles(...a),
}));
vi.mock('@/features/network-data/api/file-contact', () => ({
  fileContact: (...a: unknown[]) => fileContact(...a),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ContactRoles } from '../ContactRoles';

function renderRoles() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContactRoles entityId="ent-steve" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getEntityRoles.mockResolvedValue([]);
  fileContact.mockResolvedValue({ ok: true });
});

describe('<ContactRoles />', () => {
  it('names the edge in directory words, not schema words', async () => {
    // PARTNER is the freelancer edge and reads as "business partner" to anyone
    // who has not seen the schema.
    getEntityRoles.mockResolvedValue(['PARTNER']);
    renderRoles();

    expect(await screen.findByText('Crew')).toBeTruthy();
    expect(screen.queryByText('PARTNER')).toBeNull();
  });

  it('shows every role someone holds, not just the first', async () => {
    getEntityRoles.mockResolvedValue(['VENDOR', 'PARTNER']);
    renderRoles();

    expect(await screen.findByText('Crew')).toBeTruthy();
    expect(screen.getByText('Vendor')).toBeTruthy();
  });

  it('files a second role without disturbing the first', async () => {
    getEntityRoles.mockResolvedValue(['PARTNER']);
    renderRoles();
    fireEvent.click(await screen.findByRole('button', { name: /Also file this contact as another role/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Vendor' }));

    await waitFor(() => expect(fileContact).toHaveBeenCalledWith('ent-steve', 'VENDOR'));
  });

  it('does not offer a role they already hold', async () => {
    getEntityRoles.mockResolvedValue(['PARTNER']);
    renderRoles();
    fireEvent.click(await screen.findByRole('button', { name: /Also file this contact/ }));

    // "Crew" is present as the existing chip, but not as something to add.
    expect(screen.getAllByText('Crew')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Vendor' })).toBeTruthy();
  });

  it('offers every role to a contact who holds none', async () => {
    renderRoles();
    fireEvent.click(await screen.findByRole('button', { name: /Also file this contact/ }));

    for (const label of ['Client', 'Crew', 'Vendor', 'Venue']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('backs out without filing anything', async () => {
    getEntityRoles.mockResolvedValue(['PARTNER']);
    renderRoles();
    fireEvent.click(await screen.findByRole('button', { name: /Also file this contact/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fileContact).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Vendor' })).toBeNull();
  });
});
