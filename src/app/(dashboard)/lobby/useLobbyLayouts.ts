'use client';

/**
 * useLobbyLayouts — client-side state machine for the Lobby layouts system.
 *
 * Owns the local mirror of the server layouts array, the active id, edit
 * mode, and every mutation handler (activate/duplicate/create/rename/save/
 * delete). All server calls are wrapped in optimistic-then-revert-on-error
 * and surface errors via sonner toasts.
 *
 * Extracted from LobbyClient so the client component stays under the
 * file-size ratchet and the mutation flow is independently testable.
 *
 * @module app/(dashboard)/lobby/useLobbyLayouts
 */

import * as React from 'react';
import { toast } from 'sonner';
import type { LobbyLayout, PresetSlug } from '@/shared/lib/lobby-layouts/types';
import {
  activateLayout,
  createLayoutFromPreset,
  createBlankLayout,
  renameLayout,
  saveCustomLayout,
  deleteLayout,
} from './actions/lobby-layouts';

interface UseLobbyLayoutsArgs {
  initialLayouts: LobbyLayout[];
  initialActiveId: string;
}

export interface UseLobbyLayoutsResult {
  layouts: LobbyLayout[];
  activeLayout: LobbyLayout | undefined;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  handleActivate: (id: string) => Promise<void>;
  handleReorder: (newOrder: string[]) => void;
  handleRemove: (cardId: string) => void;
  handleAdd: (cardId: string) => void;
  handleDuplicatePreset: (slug: PresetSlug, name: string) => Promise<void>;
  handleDuplicateActive: () => void;
  handleCreateBlank: (name: string) => Promise<void>;
  handleRename: (id: string, name: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
}

function toastError(err: unknown, fallback: string) {
  toast.error(err instanceof Error ? err.message : fallback);
}

type LayoutsSetter = React.Dispatch<React.SetStateAction<LobbyLayout[]>>;

/**
 * Returns a pair of setters over the layouts list: mark one layout active,
 * and patch an individual layout. Kept separate so the main hook body stays
 * small.
 */
function useLayoutMutators(setLayouts: LayoutsSetter) {
  const setActive = React.useCallback(
    (id: string) => {
      setLayouts((prev) => prev.map((l) => ({ ...l, isActive: l.id === id })));
    },
    [setLayouts],
  );
  const patchLayout = React.useCallback(
    (id: string, patch: Partial<LobbyLayout>) => {
      setLayouts((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      );
    },
    [setLayouts],
  );
  return { setActive, patchLayout };
}

/** Card-ordering handlers for custom layouts (reorder / remove / add). */
function useCardOrderHandlers(
  activeLayout: LobbyLayout | undefined,
  patchLayout: (id: string, patch: Partial<LobbyLayout>) => void,
) {
  const persist = React.useCallback(
    async (id: string, newCardIds: string[], previous: string[]) => {
      try {
        await saveCustomLayout(id, newCardIds);
      } catch (err) {
        patchLayout(id, { cardIds: previous });
        toastError(err, 'Could not save view');
      }
    },
    [patchLayout],
  );

  const applyOrder = React.useCallback(
    (newOrder: string[]) => {
      if (!activeLayout || activeLayout.kind !== 'custom') return;
      const previous = activeLayout.cardIds;
      patchLayout(activeLayout.id, { cardIds: newOrder });
      void persist(activeLayout.id, newOrder, previous);
    },
    [activeLayout, patchLayout, persist],
  );

  const handleReorder = React.useCallback(
    (newOrder: string[]) => applyOrder(newOrder),
    [applyOrder],
  );
  const handleRemove = React.useCallback(
    (cardId: string) => {
      if (!activeLayout || activeLayout.kind !== 'custom') return;
      applyOrder(activeLayout.cardIds.filter((c) => c !== cardId));
    },
    [activeLayout, applyOrder],
  );
  const handleAdd = React.useCallback(
    (cardId: string) => {
      if (!activeLayout || activeLayout.kind !== 'custom') return;
      if (activeLayout.cardIds.includes(cardId)) return;
      applyOrder([...activeLayout.cardIds, cardId]);
    },
    [activeLayout, applyOrder],
  );

  return { handleReorder, handleRemove, handleAdd };
}

/** Duplicate-preset + create-blank handlers, both of which push a new layout. */
function useLayoutCreationHandlers({
  activeLayout,
  setLayouts,
  setActiveId,
  setEditMode,
}: {
  activeLayout: LobbyLayout | undefined;
  setLayouts: LayoutsSetter;
  setActiveId: React.Dispatch<React.SetStateAction<string>>;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const pushNewLayout = React.useCallback(
    (newLayout: LobbyLayout) => {
      setLayouts((prev) => [
        ...prev.map((l) => ({ ...l, isActive: false })),
        { ...newLayout, isActive: true },
      ]);
      setActiveId(newLayout.id);
      setEditMode(true);
    },
    [setLayouts, setActiveId, setEditMode],
  );

  const handleDuplicatePreset = React.useCallback(
    async (slug: PresetSlug, name: string) => {
      try {
        const newLayout = await createLayoutFromPreset(slug, name);
        pushNewLayout(newLayout);
        toast.success(`Created ${newLayout.name}`);
      } catch (err) {
        toastError(err, 'Could not duplicate view');
      }
    },
    [pushNewLayout],
  );

  const handleDuplicateActive = React.useCallback(() => {
    if (!activeLayout || activeLayout.kind !== 'preset') return;
    const slug =
      (activeLayout.sourcePresetSlug as PresetSlug | undefined) ??
      (activeLayout.id as PresetSlug);
    void handleDuplicatePreset(slug, `${activeLayout.name} copy`);
  }, [activeLayout, handleDuplicatePreset]);

  const handleCreateBlank = React.useCallback(
    async (name: string) => {
      try {
        const newLayout = await createBlankLayout(name);
        pushNewLayout(newLayout);
        toast.success(`Created ${newLayout.name}`);
      } catch (err) {
        toastError(err, 'Could not create view');
      }
    },
    [pushNewLayout],
  );

  return { handleDuplicatePreset, handleDuplicateActive, handleCreateBlank };
}

/** Rename + delete handlers for existing custom layouts. */
function useLayoutEditHandlers({
  layouts,
  activeId,
  setLayouts,
  setActiveId,
  setEditMode,
  patchLayout,
}: {
  layouts: LobbyLayout[];
  activeId: string;
  setLayouts: LayoutsSetter;
  setActiveId: React.Dispatch<React.SetStateAction<string>>;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  patchLayout: (id: string, patch: Partial<LobbyLayout>) => void;
}) {
  const handleRename = React.useCallback(
    async (id: string, name: string) => {
      const previous = layouts.find((l) => l.id === id)?.name ?? '';
      patchLayout(id, { name });
      try {
        await renameLayout(id, name);
      } catch (err) {
        patchLayout(id, { name: previous });
        toastError(err, 'Could not rename view');
      }
    },
    [layouts, patchLayout],
  );

  const handleDelete = React.useCallback(
    async (id: string) => {
      const previous = layouts;
      const remaining = previous.filter((l) => l.id !== id);
      const fallback =
        remaining.find((l) => l.id === 'default') ??
        remaining.find((l) => l.kind === 'preset') ??
        remaining[0];
      const nextActiveId = fallback?.id ?? '';
      setLayouts(
        remaining.map((l) => ({ ...l, isActive: l.id === nextActiveId })),
      );
      setActiveId(nextActiveId);
      setEditMode(false);
      try {
        await deleteLayout(id);
        toast.success('View deleted');
      } catch (err) {
        setLayouts(previous);
        setActiveId(activeId);
        toastError(err, 'Could not delete view');
      }
    },
    [layouts, activeId, setLayouts, setActiveId, setEditMode],
  );

  return { handleRename, handleDelete };
}

export function useLobbyLayouts({
  initialLayouts,
  initialActiveId,
}: UseLobbyLayoutsArgs): UseLobbyLayoutsResult {
  const [layouts, setLayouts] = React.useState<LobbyLayout[]>(initialLayouts);
  const [activeId, setActiveId] = React.useState<string>(initialActiveId);
  const [editMode, setEditMode] = React.useState(false);

  // Keep local state in lockstep with the server when props change.
  React.useEffect(() => {
    setLayouts(initialLayouts);
    setActiveId(initialActiveId);
    const active = initialLayouts.find((l) => l.id === initialActiveId);
    if (!active || active.kind !== 'custom') setEditMode(false);
  }, [initialLayouts, initialActiveId]);

  const activeLayout = React.useMemo(
    () =>
      layouts.find((l) => l.id === activeId) ??
      layouts.find((l) => l.isActive) ??
      layouts[0],
    [layouts, activeId],
  );

  const { setActive, patchLayout } = useLayoutMutators(setLayouts);

  const handleActivate = React.useCallback(
    async (id: string) => {
      const previousId = activeId;
      setActive(id);
      setActiveId(id);
      setEditMode(false);
      try {
        await activateLayout(id);
      } catch (err) {
        setActive(previousId);
        setActiveId(previousId);
        toastError(err, 'Could not switch view');
      }
    },
    [activeId, setActive],
  );

  const { handleReorder, handleRemove, handleAdd } = useCardOrderHandlers(
    activeLayout,
    patchLayout,
  );

  const { handleDuplicatePreset, handleDuplicateActive, handleCreateBlank } =
    useLayoutCreationHandlers({
      activeLayout,
      setLayouts,
      setActiveId,
      setEditMode,
    });
  const { handleRename, handleDelete } = useLayoutEditHandlers({
    layouts,
    activeId,
    setLayouts,
    setActiveId,
    setEditMode,
    patchLayout,
  });

  return {
    layouts,
    activeLayout,
    editMode,
    setEditMode,
    handleActivate,
    handleReorder,
    handleRemove,
    handleAdd,
    handleDuplicatePreset,
    handleDuplicateActive,
    handleCreateBlank,
    handleRename,
    handleDelete,
  };
}
