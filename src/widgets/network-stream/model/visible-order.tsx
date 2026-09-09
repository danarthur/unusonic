'use client';

/**
 * What the panel is a peek INTO.
 *
 * Moving between adjacent records is the defining feature of a peek -- Airtable's
 * sidesheet, Linear's Quicklook and Jira's preview panel all have it, and its
 * absence is the tell that a drawer is really a cramped page. You open a contact
 * to answer a question, find it is the wrong contact, and the only way to the
 * next one is to close, find your place again, and open another.
 *
 * The order cannot be derived from the URL or the server: it is whatever the
 * grid is showing right now, after a search, a category and a sort. The grid and
 * the panel are siblings under a server component, so the grid publishes here
 * and the panel reads.
 *
 * Deliberately holds ids rather than nodes. This is a navigation aid; anything
 * needing the record itself already fetches it.
 *
 * @module widgets/network-stream/model/visible-order
 */

import * as React from 'react';

export type VisibleEntry = { id: string; kind: string };

type VisibleOrder = {
  entries: VisibleEntry[];
  publish: (entries: VisibleEntry[]) => void;
};

const EMPTY: VisibleEntry[] = [];

const VisibleOrderContext = React.createContext<VisibleOrder>({
  entries: EMPTY,
  publish: () => {},
});

export function VisibleOrderProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = React.useState<VisibleEntry[]>(EMPTY);
  const value = React.useMemo(() => ({ entries, publish: setEntries }), [entries]);
  return <VisibleOrderContext.Provider value={value}>{children}</VisibleOrderContext.Provider>;
}

/**
 * Publish the order on screen.
 *
 * Keyed on a joined string, because the array is rebuilt every render -- it is
 * derived from search, category and sort -- and passing it directly as a
 * dependency would loop.
 */
export function usePublishVisibleOrder(entries: VisibleEntry[]): void {
  const { publish } = React.useContext(VisibleOrderContext);
  const key = entries.map((e) => `${e.id}:${e.kind}`).join(',');

  React.useEffect(() => {
    if (!key) {
      publish(EMPTY);
      return;
    }
    publish(
      key.split(',').map((pair) => {
        const [id, kind] = pair.split(':');
        return { id, kind };
      }),
    );
  }, [key, publish]);
}

/** Where a record sits in the visible list, and what is either side of it. */
export function useNeighbours(currentId: string | null | undefined): {
  previous: VisibleEntry | null;
  next: VisibleEntry | null;
  position: { index: number; total: number } | null;
} {
  const { entries } = React.useContext(VisibleOrderContext);
  const index = currentId ? entries.findIndex((e) => e.id === currentId) : -1;

  // Not in the list: reached by deep link, or filtered out since opening.
  // Offering the neighbours of a place you are not standing would be a guess.
  if (index === -1) return { previous: null, next: null, position: null };

  return {
    previous: index > 0 ? entries[index - 1] : null,
    next: index < entries.length - 1 ? entries[index + 1] : null,
    position: { index: index + 1, total: entries.length },
  };
}
