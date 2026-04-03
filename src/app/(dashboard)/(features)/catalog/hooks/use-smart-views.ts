/**
 * Smart views — saved filter combinations that persist per workspace in localStorage.
 * Designed for future migration to a DB table if needed.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import type { PackageCategory } from '@/features/sales/api/package-actions';

type CatalogTab = 'all' | PackageCategory;

export interface SmartView {
  id: string;
  name: string;
  filters: {
    categoryTab: CatalogTab;
    tagFilterId: string | null;
    searchQuery: string;
  };
}

const STORAGE_KEY = (wsId: string) => `unusonic_catalog_smart_views_${wsId}`;

function loadFromStorage(workspaceId: string | null): SmartView[] {
  if (!workspaceId) return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY(workspaceId));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Silently ignore corrupt data or server-side render (no localStorage)
  }
  return [];
}

export function useSmartViews(workspaceId: string | null) {
  // Start empty to avoid SSR/client hydration mismatch (localStorage is client-only)
  const [views, setViews] = useState<SmartView[]>([]);

  // Load from localStorage after mount
  useEffect(() => {
    setViews(loadFromStorage(workspaceId));
  }, [workspaceId]);

  const persist = useCallback(
    (updated: SmartView[]) => {
      if (!workspaceId) return;
      setViews(updated);
      try {
        localStorage.setItem(STORAGE_KEY(workspaceId), JSON.stringify(updated));
      } catch {
        // Storage full or unavailable
      }
    },
    [workspaceId]
  );

  const saveView = useCallback(
    (name: string, filters: SmartView['filters']) => {
      const newView: SmartView = {
        id: `sv_${Date.now()}`,
        name,
        filters,
      };
      persist([...views, newView]);
      return newView;
    },
    [views, persist]
  );

  const deleteView = useCallback(
    (id: string) => {
      persist(views.filter((v) => v.id !== id));
    },
    [views, persist]
  );

  const renameView = useCallback(
    (id: string, name: string) => {
      persist(views.map((v) => (v.id === id ? { ...v, name } : v)));
    },
    [views, persist]
  );

  return { views, saveView, deleteView, renameView };
}
