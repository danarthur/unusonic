/**
 * NetworkCard — every card is the same shape.
 *
 * The defect this guards was structural, not cosmetic: nine conditionally
 * rendered slots meant no two cards shared a height, so the grid read as broken
 * even when each card was individually fine. Comparison — "who can work
 * Saturday" — needs the same field in the same physical position on every card.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NetworkCard } from '../NetworkCard';
import { CARD_SLOT_COUNT } from '../../model/card-slots';
import type { NetworkNode } from '../../model/types';

function node(over: Partial<NetworkNode> = {}, meta: Partial<NetworkNode['meta']> = {}): NetworkNode {
  return {
    id: 'edge-1',
    entityId: 'ent-1',
    kind: 'external_partner',
    gravity: 'outer_orbit',
    identity: { name: 'Marcus Delacroix', avatarUrl: null, label: 'Photographer', entityType: 'person' },
    meta: { ...meta },
    ...over,
  } as NetworkNode;
}

/** The detail block under the role line, however full it happens to be. */
function detailRows(container: HTMLElement): HTMLElement[] {
  const block = container.querySelector('.mt-2.flex.flex-col');
  return Array.from(block?.children ?? []) as HTMLElement[];
}

describe('<NetworkCard /> shape', () => {
  it('reserves the same number of detail rows for a fully populated entity', () => {
    const { container } = render(
      <NetworkCard
        node={node({}, { outstanding_balance: 2400, lastWorked: '2026-08-16', region: 'Napa, CA' })}
      />,
    );
    expect(detailRows(container)).toHaveLength(CARD_SLOT_COUNT);
  });

  // Nearly everyone in this directory is a ghost: a name, maybe a phone, and
  // nothing else. If a sparse card collapses, it knocks every card beside it
  // out of alignment.
  it('reserves the same rows for an entity with nothing on file', () => {
    const { container } = render(<NetworkCard node={node()} />);
    expect(detailRows(container)).toHaveLength(CARD_SLOT_COUNT);
    expect(screen.getByText('Marcus Delacroix')).toBeTruthy();
  });

  it('states which direction the money runs', () => {
    render(<NetworkCard node={node({}, { outstanding_balance: 2400 })} />);
    expect(screen.getByText('Owes $2,400')).toBeTruthy();
  });

  it('leads a venue with where it is, not with an icon standing in for it', () => {
    render(
      <NetworkCard
        node={node(
          { identity: { name: 'The Estate', avatarUrl: null, label: 'Venue', entityType: 'venue' } },
          { region: 'Napa, CA' },
        )}
      />,
    );
    expect(screen.getByText('Napa, CA')).toBeTruthy();
  });

  // These people often have no direct edge to the workspace, so the company
  // card is the only place they appear at all.
  it('keeps the people named on a company card reachable', () => {
    const onAffiliate = vi.fn();
    render(
      <NetworkCard
        node={node({
          identity: { name: 'Brandi Jane Events', avatarUrl: null, label: 'Partner', entityType: 'company' },
          affiliates: [
            { entityId: 'p1', name: 'Brandi Jane', jobTitle: null },
            { entityId: 'p2', name: 'Alexa Infranca', jobTitle: null },
          ],
        })}
        onAffiliateClick={onAffiliate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Alexa Infranca' }));
    expect(onAffiliate).toHaveBeenCalledWith('p2');
  });

  it('does not open the company when a person named on it is clicked', () => {
    const onOpenCompany = vi.fn();
    render(
      <NetworkCard
        node={node({
          identity: { name: 'Brandi Jane Events', avatarUrl: null, label: 'Partner', entityType: 'company' },
          affiliates: [{ entityId: 'p1', name: 'Brandi Jane', jobTitle: null }],
        })}
        onClick={onOpenCompany}
        onAffiliateClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Brandi Jane' }));
    expect(onOpenCompany).not.toHaveBeenCalled();
  });

  // Used to render only for core nodes, so it was invisible on vendors and
  // venues — where "never again" is the more consequential judgement.
  it('shows do-not-rebook on an outside partner', () => {
    render(<NetworkCard node={node({}, { doNotRebook: true })} />);
    expect(screen.getByText('Do not rebook')).toBeTruthy();
  });

  describe('fields that were deliberately removed', () => {
    it('does not print a compliance grade on an outside partner', () => {
      // W-9 and COI are scoped to people we employ, and belong on a record tab
      // rather than a scanning surface. This used to render for any person.
      render(<NetworkCard node={node({}, { w9_status: true, coi_expiry: '2027-01-01', market: 'Napa' })} />);
      for (const word of ['Core', 'Ready', 'Compliant']) {
        expect(screen.queryByText(word)).toBeNull();
      }
    });

    it('does not print the row-creation date as if it were relationship memory', () => {
      render(<NetworkCard node={node({}, { connectedSince: '2024-03-02T00:00:00.000Z' })} />);
      expect(screen.queryByText(/since/i)).toBeNull();
    });

    it('does not repeat the role in a second chip', () => {
      render(<NetworkCard node={node()} />);
      expect(screen.getAllByText('Photographer')).toHaveLength(1);
    });

    it('does not put an email address on the scanning surface', () => {
      render(<NetworkCard node={node({}, { email: 'marcus@example.com' })} />);
      expect(screen.queryByText(/marcus@example\.com/)).toBeNull();
    });
  });
});
